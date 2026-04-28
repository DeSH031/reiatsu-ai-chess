"use client";

import { type User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type BrowserSupabaseClient = NonNullable<typeof supabase>;
type GameResultStatus = "checkmate" | "stalemate" | "draw";
type PlayerColor = "white" | "black" | null;

export type Profile = {
  id: string;
  username: string;
  reiatsu: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
};

type ProfileStatsUpdateInput = {
  userId: string;
  reiatsuChange: number;
  result: GameResultStatus;
  winner: Exclude<PlayerColor, null> | null;
  playerColor: PlayerColor;
  client?: typeof supabase;
};

export type ProfileStatsUpdateResult = {
  profile: Profile | null;
  reiatsuBefore: number;
  reiatsuAfter: number;
  reiatsuDelta: number;
};

function getSupabaseClient(
  client: typeof supabase = supabase
): BrowserSupabaseClient | null {
  return client;
}

function getMetadataUsername(user: User | null): string {
  const metadataUsername =
    typeof user?.user_metadata?.username === "string"
      ? user.user_metadata.username.trim()
      : "";

  return metadataUsername;
}

export async function getCurrentUser(
  client: typeof supabase = supabase
): Promise<User | null> {
  const supabaseClient = getSupabaseClient(client);

  if (!supabaseClient) {
    return null;
  }

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Supabase getCurrentUser failed", error);
    return null;
  }

  return session?.user ?? null;
}

export async function getProfile(
  userId: string,
  client: typeof supabase = supabase
): Promise<Profile | null> {
  const supabaseClient = getSupabaseClient(client);

  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, reiatsu, games_played, wins, losses, draws, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase getProfile failed", error);
    return null;
  }

  return (data as Profile | null) ?? null;
}

export async function updateProfileStats({
  userId,
  reiatsuChange,
  result,
  winner,
  playerColor,
  client = supabase,
}: ProfileStatsUpdateInput): Promise<ProfileStatsUpdateResult | null> {
  const supabaseClient = getSupabaseClient(client);

  if (!supabaseClient) {
    return null;
  }

  const existingProfile = await getProfile(userId, supabaseClient);
  const currentUser = await getCurrentUser(supabaseClient);
  const username =
    existingProfile?.username ??
    getMetadataUsername(currentUser?.id === userId ? currentUser : null);

  if (!username) {
    console.error("Supabase updateProfileStats failed: missing profile username", {
      userId,
    });
    return null;
  }

  const nextGamesPlayed = (existingProfile?.games_played ?? 0) + 1;
  const currentReiatsu = existingProfile?.reiatsu ?? 0;
  const nextReiatsu = Math.max(0, currentReiatsu + reiatsuChange);
  let nextWins = existingProfile?.wins ?? 0;
  let nextLosses = existingProfile?.losses ?? 0;
  let nextDraws = existingProfile?.draws ?? 0;

  if (result === "draw" || result === "stalemate") {
    nextDraws += 1;
  } else if (playerColor && winner) {
    if (winner === playerColor) {
      nextWins += 1;
    } else {
      nextLosses += 1;
    }
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(
      {
        id: userId,
        username,
        reiatsu: nextReiatsu,
        games_played: nextGamesPlayed,
        wins: nextWins,
        losses: nextLosses,
        draws: nextDraws,
      },
      { onConflict: "id" }
    )
    .select("id, username, reiatsu, games_played, wins, losses, draws, created_at")
    .maybeSingle();

  if (error) {
    console.error("Supabase updateProfileStats failed", error);
    return null;
  }

  return {
    profile: (data as Profile | null) ?? null,
    reiatsuBefore: currentReiatsu,
    reiatsuAfter: nextReiatsu,
    reiatsuDelta: nextReiatsu - currentReiatsu,
  };
}
