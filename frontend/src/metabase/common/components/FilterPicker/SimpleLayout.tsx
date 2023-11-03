import type { ReactNode } from "react";
import { isValidElement } from "react";
import { t } from "ttag";
import { Button, Box } from "metabase/ui";
import { MAX_WIDTH } from "./constants";
import { BackButton } from "./BackButton";
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
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        {headerRight}
      </Header>
      <Box>
        {children}
        <Footer>
          {isValidElement(footerLeft) ? footerLeft : <Box />}
          <Button variant="filled" disabled={!canSubmit} onClick={onSubmit}>
            {isNew ? t`Add filter` : t`Update filter`}
          </Button>
        </Footer>
      </Box>
    </Box>
  );
}
