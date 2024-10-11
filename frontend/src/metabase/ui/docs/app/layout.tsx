"use client";
import localFont from "next/font/local";
import "./globals.css";

import { AppShell, Navbar, Header, MantineProvider } from "@mantine/core";
import Link from "next/link";
import { Box, Title } from "metabase/ui";

const Lato = localFont({
  src: "../../../../../../resources/frontend_client/app/fonts/Lato/Lato-Regular.ttf",
  variable: "--font-lato",
  weight: "100 400 700 900",
});

import { getThemeOverrides } from "../../theme";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = getThemeOverrides();
  return (
    <html lang="en">
      <body className={`${Lato.variable}`}>
        <MantineProvider theme={theme}>
          <AppShell
            padding="md"
            navbar={
              <Navbar width={{ base: 300 }} p="md">
                <Link href="/">Home</Link>
                <Box my="md">
                  <Title order={4}>System</Title>
                  <Box my="md">
                    <Box>
                      <Link href="/colors">Colors</Link>
                    </Box>
                    <Box>
                      <Link href="/typograghy">Typography</Link>
                    </Box>
                  </Box>
                </Box>

                <Box my="md">
                  <Title order={4}>Core Components</Title>
                  <Box>
                    <Link href="/components/button">Button</Link>
                  </Box>
                  <Box>
                    <Link href="/components/radio">Radio</Link>
                  </Box>
                </Box>
              </Navbar>
            }
            header={
              <Header height={60} p="xs">
                <Link href="/">Metabase</Link>
              </Header>
            }
          >
            <Box ml="auto" mr="auto" maw={1200} w={800}>
              {/* @ts-ignore */}
              {children}
            </Box>
          </AppShell>
        </MantineProvider>
      </body>
    </html>
  );
}
