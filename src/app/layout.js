import "./globals.css";

export const metadata = {
  title: 'LMA Abata',
  description: 'Lunch Management Application',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png', // Logo kecil di tab browser
    apple: '/icon.png',   // Logo yang muncul saat di-install di iPhone/iPad
  },
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