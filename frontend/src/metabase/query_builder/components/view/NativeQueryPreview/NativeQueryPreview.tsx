import type { ReactNode } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { rem, Flex, Box, Icon, Loader } from "metabase/ui";

import { NativeCodePanel } from "../NativeCodePanel";

interface NativeQueryPreviewProps {
  title: string;
  query?: string;
  error?: string;
  isLoading?: boolean;
  children?: ReactNode;
  onClose?: () => void;
}

const Header = ({ children }: { children: ReactNode }) => (
  <Flex align="center" mb="1.5rem">
    {children}
  </Flex>
);

const ModalWarningIcon = () => (
  <Icon
    name="warning"
    size="1rem"
    color={color("error")}
    style={{ flex: "0 0 auto", marginRight: `${rem(12)}` }}
  />
);

const Title = ({ children }: { children: string }) => (
  <Box
    c={color("text-dark")}
    fz={rem(20)}
    lh={rem(24)}
    fw="bold"
    style={{ flex: "1 1 auto" }}
  >
    {children}
  </Box>
);

const CloseButton = ({ onClose }: Pick<NativeQueryPreviewProps, "onClose">) => (
  <Flex
    align="center"
    justify="center"
    style={{ borderRadius: `${rem(6)}`, cursor: "pointer" }}
  >
    <Icon name="close" onClick={onClose} color={color("text-light")} />
  </Flex>
);

const Divider = () => (
  <Box mb="lg" style={{ borderTop: `1px solid ${color("border")}` }}></Box>
);

const Footer = ({ children }: { children: ReactNode }) => (
  <Flex justify="end" mt="lg">
    {children}
  </Flex>
);

export const NativeQueryPreview = ({
  title,
  query,
  error,
  isLoading,
  children,
  onClose,
}: NativeQueryPreviewProps): JSX.Element => {
  return (
    <Flex
      direction="column"
      p="xl"
      miw={rem(640)}
      maw={rem(1360)}
      mih={rem(320)}
      mah={rem(1440)}
    >
      <Header>
        {error && <ModalWarningIcon />}
        <Title>{error ? t`An error occurred in your query` : title}</Title>
        {onClose && <CloseButton onClose={onClose} />}
      </Header>
      {error && <Divider />}
      <Flex
        direction="column"
        justify={isLoading ? "center" : undefined}
        align={isLoading ? "center" : undefined}
        mih={0}
        style={{ flex: "1 1 auto" }}
      >
        {isLoading ? (
          <Loader c={color("brand")} />
        ) : error ? (
          <NativeCodePanel value={error} isHighlighted />
        ) : query ? (
          <NativeCodePanel value={query} isCopyEnabled />
        ) : null}
      </Flex>
      {children && <Footer>{children}</Footer>}
    </Flex>
  );
};
