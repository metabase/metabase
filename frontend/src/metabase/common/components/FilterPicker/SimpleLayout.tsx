import type { ReactNode } from "react";
import { Box } from "metabase/ui";
import { MAX_WIDTH } from "./constants";
import { Header } from "./Header";
import { Footer } from "./Footer";

interface SimpleLayoutProps {
  columnName: string;

  isNew: boolean;
  canSubmit: boolean;

  headerRight?: ReactNode;
  footerLeft?: ReactNode;
  children: ReactNode;
  testID?: string;

  onSubmit: () => void;
  onBack: () => void;
}

export function SimpleLayout({
  columnName,
  isNew,
  canSubmit,
  headerRight,
  footerLeft,
  children,
  testID,
  onSubmit,
  onBack,
}: SimpleLayoutProps) {
  return (
    <Box maw={MAX_WIDTH} data-testid={testID}>
      <Header columnName={columnName} onBack={onBack}>
        {headerRight}
      </Header>
      <Box>
        {children}
        <Footer isNew={isNew} canSubmit={canSubmit} onSubmit={onSubmit}>
          {footerLeft}
        </Footer>
      </Box>
    </Box>
  );
}
