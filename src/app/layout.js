import "./globals.css";

export const metadata = {
  title: 'LMA Abata',
  description: 'Lunch Management Application',
  manifest: '/manifest.json',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Lunch Order - Abata Leaderss',
    description: 'Yuk, isi pesanan makan siangmu sekarang sebelum batas cut-off!',
    url: 'https://lunch.abata.sch.id', 
    siteName: 'Lunch Abata',
    images: [
      {
        // PENTING: Gunakan URL penuh (Absolute) dan arahkan ke icon.png yang lebih besar
        url: 'https://lunch.abata.sch.id/icon.png', 
        width: 800,
        height: 600,
        alt: 'Logo Abata Leaderss',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  icons: {
    icon: '/favicon.png', // Logo kecil di tab browser
    apple: '/icon.png',   // Logo yang muncul saat di-install di iPhone/iPad
  },
  // appleWebApp digabung menjadi satu
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LMA Abata',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        {/* Bootstrap CSS */}
        <link 
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" 
          rel="stylesheet" 
        />
        {/* Bootstrap Icons */}
        <link 
          rel="stylesheet" 
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" 
        />
      </head>
      <body style={{ backgroundColor: '#f4f6fb', color: '#0f172a' }}>
        {children}
      </body>
    </html>
  );
}