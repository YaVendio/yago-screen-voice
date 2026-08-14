import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Voice agent demo',
  description: 'A voice agent that watches your screen and talks you through a setup flow.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
