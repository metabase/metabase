import { Skeleton, Stack } from "metabase/ui";

export function ProviderListSkeleton() {
  return (
    <Stack gap="sm" data-testid="provider-list-skeleton">
      <Skeleton h="4rem" radius="md" />
      <Skeleton h="4rem" radius="md" />
    </Stack>
  );
}
