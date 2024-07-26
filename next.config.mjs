/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    MONGODB_URI: process.env.MONGODB_URI,
    MAILZY_SEC: process.env.MAILZY_SEC
  }
};

export default nextConfig;
