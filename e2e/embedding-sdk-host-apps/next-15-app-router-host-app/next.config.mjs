import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prevent Next.js from detecting parent pnpm-lock.yaml as workspace root
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
