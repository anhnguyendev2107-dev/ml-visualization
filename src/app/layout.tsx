import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ML Visualization Hub",
  description: "Interactive visualizations for machine-learning architectures.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
