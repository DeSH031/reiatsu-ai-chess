import type { Profile } from "@/lib/auth";

type RecentMatch = {
  id: string;
  created_at: string;
  opponent_type: string | null;
  result: string;
  reiatsu_after: number | null;
  reiatsu_change: number | null;
};

type ProfilePanelProps = {
  profile: Profile | null;
  loading: boolean;
  matches: RecentMatch[];
  matchesLoading: boolean;
  onBack: () => void;
};

const REIATSU_GOAL = 10000;

type ReiatsuRank = {
  label: string;
  min: number;
  max: number | null;
};

const REIATSU_RANKS: ReiatsuRank[] = [
  { label: "Beginner", min: 0, max: 499 },
  { label: "Disciplined", min: 500, max: 1499 },
  { label: "Tactical", min: 1500, max: 2999 },
  { label: "Elite", min: 3000, max: 5999 },
  { label: "Master", min: 6000, max: 9999 },
  { label: "Graduated", min: 10000, max: null },
];

function formatWinrate(profile: Profile | null): string {
  if (!profile || profile.games_played === 0) {
    return "0.0%";
  }

  return `${((profile.wins / profile.games_played) * 100).toFixed(1)}%`;
}

function getReiatsuRank(reiatsu: number): {
  current: ReiatsuRank;
  next: ReiatsuRank | null;
} {
  const currentIndex = REIATSU_RANKS.findIndex((rank) => {
    if (rank.max === null) {
      return reiatsu >= rank.min;
    }

    return reiatsu >= rank.min && reiatsu <= rank.max;
  });

  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return {
    current: REIATSU_RANKS[safeIndex],
    next: REIATSU_RANKS[safeIndex + 1] ?? null,
  };
}

function getReiatsuProgress(reiatsu: number): number {
  return Math.min(100, (Math.max(0, reiatsu) / REIATSU_GOAL) * 100);
}

export default function ProfilePanel({
  profile,
  loading,
  matches,
  matchesLoading,
  onBack,
}: ProfilePanelProps) {
  const reiatsu = profile?.reiatsu ?? 0;
  const reiatsuProgress = getReiatsuProgress(reiatsu);
  const reiatsuRank = getReiatsuRank(reiatsu);

  if (loading) {
    return (
      <section className="w-full max-w-[520px] rounded-md border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Profile
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Loading profile...
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[520px] rounded-md border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Profile
        </h2>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Back to chess
        </button>
      </div>
      {profile ? (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm text-zinc-700 dark:text-zinc-200">
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Username
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.username}
            </p>
          </div>
          <div className="col-span-2 rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Reiatsu Progress
                </p>
                <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {reiatsu} / {REIATSU_GOAL} Reiatsu
                </p>
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {reiatsuProgress.toFixed(1)}%
              </p>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-100"
                style={{ width: `${reiatsuProgress}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Current Rank
                </p>
                <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {reiatsuRank.current.label}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Next Rank
                </p>
                <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {reiatsuRank.next ? reiatsuRank.next.label : "Complete"}
                </p>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Reiatsu
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.reiatsu}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Winrate
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {formatWinrate(profile)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Games Played
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.games_played}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Wins
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.wins}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Losses
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.losses}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Draws
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {profile.draws}
            </p>
          </div>
          <div className="col-span-2 rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Recent Matches
              </p>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Latest 10
              </span>
            </div>
            {matchesLoading ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                Loading matches...
              </p>
            ) : matches.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                No recent matches yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {matches.map((match) => (
                  <article
                    key={match.id}
                    className="rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {match.result}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(match.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="rounded-sm bg-zinc-100 px-2 py-1 text-xs font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {match.opponent_type ?? "unknown"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                      <p>
                        Reiatsu Delta:{" "}
                        {match.reiatsu_change === null ? "-" : match.reiatsu_change}
                      </p>
                      <p>
                        Reiatsu After:{" "}
                        {match.reiatsu_after === null ? "-" : match.reiatsu_after}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Profile data is not available yet.
        </p>
      )}
    </section>
  );
}
