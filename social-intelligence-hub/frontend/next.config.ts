import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  images: {
    domains: ["lh3.googleusercontent.com", "avatars.githubusercontent.com"],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: "0.1.0",
  },
};

export default nextConfig;
