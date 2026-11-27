import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EA Constructor — Diseña tu estrategia",
  description: "Crea y exporta Expert Advisors para MetaTrader 4 y MetaTrader 5, sin escribir código.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
