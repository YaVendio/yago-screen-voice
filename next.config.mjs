/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Without this the browser denies getUserMedia outright and the agent can never
          // hear anyone. It is emitted at build time, which is why it cannot be decided
          // per user by a feature flag.
          { key: 'Permissions-Policy', value: 'microphone=(self), display-capture=(self)' },
        ],
      },
    ]
  },
}

export default nextConfig
