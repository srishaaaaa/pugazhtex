import { redirect } from "next/navigation";

/**
 * Legacy path kept alive so any bookmarked or previously shared URL still lands
 * on the POS terminal. The route itself moved to /pos.
 */
export default function LegacyPosPath() {
  redirect("/pos");
}