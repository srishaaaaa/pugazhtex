import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the app root so a stray package-lock.json in a parent folder
    // (common on Windows dev machines) cannot be picked up by the bundler.
    root: path.resolve("."),
  },
};

export default nextConfig;


