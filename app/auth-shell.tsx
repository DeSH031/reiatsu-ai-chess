"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type User } from "@supabase/supabase-js";
import ChessboardPanel from "./chessboard";
import ProfilePanel from "./profile-panel";
import {
  getCurrentUser,
  getProfile,
  type Profile,
} from "@/lib/auth";
import {
  hasSupabaseEnv,
  missingSupabaseEnvKeys,
  supabase,
} from "@/lib/supabaseClient";

type AuthMode = "signin" | "signup";
type MatchHistoryRow = {
  id: string;
  created_at: string;
  opponent_type: string | null;
  result: string;
  winner: string | null;
  game_mode: string;
  ai_difficulty: string | null;
  reiatsu_after: number | null;
  reiatsu_change: number | null;
  move_history: unknown;
};
type AuthenticatedView = "chess" | "profile";

const AUTH_SESSION_TIMEOUT_MS = 5000;

function getMoveCount(moveHistory: unknown): number {
  if (Array.isArray(moveHistory)) {
    return moveHistory.length;
  }

  if (typeof moveHistory === "string") {
    try {
      const parsed = JSON.parse(moveHistory);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return moveHistory.trim() ? 1 : 0;
    }
  }

  return 0;
}

export default function AuthShell() {
  const isSupabaseConfigured = hasSupabaseEnv;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [submittingMode, setSubmittingMode] = useState<AuthMode | null>(null);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRow[]>([]);
  const [matchHistoryLoading, setMatchHistoryLoading] = useState(false);
  const [totalReiatsu, setTotalReiatsu] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authenticatedView, setAuthenticatedView] =
    useState<AuthenticatedView>("chess");
  const authReadyRef = useRef(authReady);
  const userRef = useRef<User | null>(user);

  useEffect(() => {
    authReadyRef.current = authReady;
    userRef.current = user;
  }, [authReady, user]);

  useEffect(() => {
    console.log("AuthShell mounted", {
      isSupabaseConfigured,
      initialAuthReady: !isSupabaseConfigured,
    });

    if (!supabase) {
      return;
    }

    let isMounted = true;
    const authTimeout = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      console.log("AuthShell fallback timeout fired", {
        authReadyBefore: authReadyRef.current,
        userBefore: userRef.current?.id ?? null,
      });
      setUser(null);
      setMatchHistory([]);
      setMatchHistoryLoading(false);
      setAuthReady(true);
    }, AUTH_SESSION_TIMEOUT_MS);

    async function loadUser() {
      console.log("AuthShell getSession started");
      const authenticatedUser = await getCurrentUser();

      if (!isMounted) {
        return;
      }

      window.clearTimeout(authTimeout);
      console.log("AuthShell getSession resolved", {
        authReadyBefore: authReadyRef.current,
        userId: authenticatedUser?.id ?? null,
        hasSession: Boolean(authenticatedUser),
      });

      setUser(authenticatedUser);
      if (!authenticatedUser) {
        setProfile(null);
        setProfileLoading(false);
        setMatchHistory([]);
        setMatchHistoryLoading(false);
        setTotalReiatsu(0);
        setAuthenticatedView("chess");
      }
      setAuthReady(true);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      console.log("AuthShell onAuthStateChange", {
        eventUserId: session?.user?.id ?? null,
        hasSession: Boolean(session),
      });
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setProfileLoading(false);
        setMatchHistory([]);
        setMatchHistoryLoading(false);
        setTotalReiatsu(0);
        setAuthenticatedView("chess");
      }
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      window.clearTimeout(authTimeout);
      subscription.unsubscribe();
    };
  }, [isSupabaseConfigured]);

  useEffect(() => {
    console.log("AuthShell state", {
      authReady,
      userId: user?.id ?? null,
      hasUser: Boolean(user),
    });
  }, [authReady, user]);

  const refreshProfile = async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      setTotalReiatsu(0);
      return;
    }

    setProfileLoading(true);

    const nextProfile = await getProfile(user.id);

    setProfile(nextProfile);
    setTotalReiatsu(nextProfile?.reiatsu ?? 0);
    setProfileLoading(false);
  };

  useEffect(() => {
    if (!supabase || !user?.id) {
      return;
    }

    const supabaseClient = supabase;
    const userId = user.id;
    let isMounted = true;

    async function loadMatchHistory() {
      setMatchHistoryLoading(true);

      const { data, error } = await supabaseClient
        .from("match_history")
        .select(
          "id, created_at, opponent_type, result, winner, game_mode, ai_difficulty, reiatsu_after, reiatsu_change, move_history"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setAuthError(error.message);
        setMatchHistory([]);
      } else {
        setMatchHistory((data ?? []) as MatchHistoryRow[]);
      }

      setMatchHistoryLoading(false);
    }

    void (async () => {
      setProfileLoading(true);
      const nextProfile = await getProfile(userId);

      if (!isMounted) {
        return;
      }

      setProfile(nextProfile);
      setTotalReiatsu(nextProfile?.reiatsu ?? 0);
      setProfileLoading(false);
    })();
    void loadMatchHistory();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  async function refreshMatchHistory() {
    if (!supabase || !user?.id) {
      return;
    }

    const supabaseClient = supabase;
    const userId = user.id;
    const { data, error } = await supabaseClient
      .from("match_history")
      .select(
        "id, created_at, opponent_type, result, winner, game_mode, ai_difficulty, reiatsu_after, reiatsu_change, move_history"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setMatchHistory((data ?? []) as MatchHistoryRow[]);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }

    setSubmittingMode("signin");
    setAuthError(null);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: signinEmail,
      password: signinPassword,
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setSigninPassword("");
    }

    setSubmittingMode(null);
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }

    if (!signupUsername.trim()) {
      setAuthError("Username is required.");
      return;
    }

    setSubmittingMode("signup");
    setAuthError(null);
    setAuthMessage(null);

    const {
      data: { user: createdUser },
      error,
    } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: {
          username: signupUsername.trim(),
        },
      },
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setSignupUsername("");
      setSignupPassword("");
      setAuthMessage(
        createdUser
          ? "Account created. Sign in if your session was not started automatically."
          : "Account created. Check your email to confirm your account."
      );
    }

    setSubmittingMode(null);
  }

  async function handleSignOut() {
    if (!supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }

    setAuthError(null);
    setAuthMessage(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="w-full max-w-2xl rounded-md border border-amber-300 bg-amber-50 px-4 py-5 text-base text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        Supabase is not configured. Missing{" "}
        <code>{missingSupabaseEnvKeys.join(", ")}</code>.
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-4 py-6 text-center text-base text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Loading session...
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <div className="flex w-full max-w-[520px] flex-col items-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 text-center sm:flex-row sm:justify-between sm:text-left dark:border-zinc-700 dark:bg-zinc-900">
          <div>
            <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile?.username ?? "Signed in"}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {user.email}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() =>
                setAuthenticatedView((currentView) =>
                  currentView === "chess" ? "profile" : "chess"
                )
              }
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {authenticatedView === "chess" ? "Profile" : "Chess"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-800 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
        {authenticatedView === "chess" ? (
          <>
            <ChessboardPanel
              onMatchSaved={refreshMatchHistory}
              onProfileUpdated={refreshProfile}
              totalReiatsu={totalReiatsu}
              onTotalReiatsuChange={setTotalReiatsu}
            />
            <section className="w-full max-w-[520px] rounded-md border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Match History
                </h2>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {matchHistory.length} matches
                </span>
              </div>
              {matchHistoryLoading ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Loading match history...
                </p>
              ) : matchHistory.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  No completed games yet.
                </p>
              ) : (
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {matchHistory.map((match) => (
                    <article
                      key={match.id}
                      className="rounded-md border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {match.result}
                          </p>
                          <p className="text-zinc-500 dark:text-zinc-400">
                            {new Date(match.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className="rounded-sm bg-zinc-100 px-2 py-1 text-xs font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {match.game_mode}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-300">
                        <p>Winner: {match.winner ?? "-"}</p>
                        <p>Moves: {getMoveCount(match.move_history)}</p>
                        <p>AI: {match.ai_difficulty ?? "-"}</p>
                        <p>
                          Reiatsu:{" "}
                          {match.reiatsu_change === null
                            ? "-"
                            : match.reiatsu_change}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <ProfilePanel
            profile={profile}
            loading={profileLoading}
            matches={matchHistory.slice(0, 10)}
            matchesLoading={matchHistoryLoading}
            onBack={() => setAuthenticatedView("chess")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-4xl gap-4 md:grid-cols-2">
      <form
        onSubmit={handleSignIn}
        className="w-full rounded-md border border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Sign in
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
              Username
            </span>
            <input
              type="text"
              value={signupUsername}
              onChange={(event) => setSignupUsername(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">Email</span>
            <input
              type="email"
              value={signinEmail}
              onChange={(event) => setSigninEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
              Password
            </span>
            <input
              type="password"
              value={signinPassword}
              onChange={(event) => setSigninPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submittingMode !== null}
          className="mt-4 w-full rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submittingMode === "signin" ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <form
        onSubmit={handleSignUp}
        className="w-full rounded-md border border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Register
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">Email</span>
            <input
              type="email"
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
              Password
            </span>
            <input
              type="password"
              value={signupPassword}
              onChange={(event) => setSignupPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submittingMode !== null}
          className="mt-4 w-full rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submittingMode === "signup" ? "Creating account..." : "Register"}
        </button>
      </form>

      {authError || authMessage ? (
        <div className="w-full md:col-span-2">
          {authError ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-base text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {authError}
            </p>
          ) : null}
          {authMessage ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-base text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {authMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
