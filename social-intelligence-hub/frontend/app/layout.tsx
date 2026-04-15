import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Social Intelligence Hub | CZFS & CAPEX",
  description:
    "Plataforma de escucha social para la Corporación Zona Franca Santiago y CAPEX. Monitoreo de reputación en tiempo real.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} antialiased min-h-screen bg-background`}>
        {children}
      </body>
    </html>
  );
}
