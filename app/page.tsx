"use client";

import { useEffect, useState } from "react";
import AuthShell from "./auth-shell";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "chess-coach-theme";

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      setTheme(savedTheme === "dark" ? "dark" : "light");
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [mounted, theme]);

  const pageThemeClass = mounted
    ? theme === "dark"
      ? "bg-black text-white"
      : "bg-white text-black"
    : "bg-white text-black";

  const themeButtonClass = mounted
    ? theme === "dark"
      ? "border-white bg-black text-white"
      : "border-black bg-white text-black"
    : "border-black bg-white text-black";

  const themeButtonLabel = mounted
    ? `Switch to ${theme === "dark" ? "light" : "dark"} mode`
    : "Theme";

  return (
    <main
      className={`flex min-h-screen w-full flex-col items-center justify-center gap-5 px-4 py-6 sm:gap-6 sm:py-8 ${pageThemeClass}`}
    >
      <div className="flex w-full max-w-6xl justify-center sm:justify-end">
        <button
          type="button"
          onClick={() =>
            setTheme((currentTheme) =>
              currentTheme === "dark" ? "light" : "dark"
            )
          }
          className={`w-full rounded-md border px-3 py-2 text-sm font-medium sm:w-auto ${themeButtonClass}`}
        >
          {themeButtonLabel}
        </button>
      </div>
      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Chess Coach
      </h1>
      <p className="text-center text-base text-zinc-600 dark:text-zinc-300 sm:text-lg">
        Sign in to save your progress and keep training.
      </p>
      <AuthShell />
    </main>
  );
}
