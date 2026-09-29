import { Box, type BoxProps } from "metabase/ui";

type MigrationCardProps = BoxProps & {
  children: React.ReactNode;
};

export const MigrationCard = (props: MigrationCardProps) => (
  <Box
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="sm"
    py="xxl"
    px="3rem"
    bg="background_page-primary"
    {...props}
  />
);
