import { Paper, type PaperProps } from "metabase/ui";

type MigrationCardProps = PaperProps & {
  children: React.ReactNode;
};

export const MigrationCard = (props: MigrationCardProps) => (
  <Paper withBorder shadow="none" radius="sm" py="xxl" px="3rem" {...props} />
);
