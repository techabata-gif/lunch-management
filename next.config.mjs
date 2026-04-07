import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development', // PWA dimatikan saat mode dev
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {}, // <-- Tambahan untuk membungkam error compiler Next.js 16
};

export default withPWA(nextConfig);