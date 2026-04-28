"use client";

import "client-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const missingSupabaseEnvKeys = [
  !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
  !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
].filter((value): value is string => value !== null);

export const hasSupabaseEnv = missingSupabaseEnvKeys.length === 0;

if (!hasSupabaseEnv) {
  console.warn(
    `Supabase env is missing: ${missingSupabaseEnvKeys.join(", ")}`
  );
}

export const supabase = hasSupabaseEnv
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  : null;
