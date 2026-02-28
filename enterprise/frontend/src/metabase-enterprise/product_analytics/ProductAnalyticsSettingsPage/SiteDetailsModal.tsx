import { t } from "ttag";

import { CodeTextBlock } from "metabase/admin/components/CodeTextBlock";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type { ProductAnalyticsSite } from "metabase-enterprise/api/product-analytics";
import { useGetProductAnalyticsSiteQuery } from "metabase-enterprise/api/product-analytics";

import S from "./SiteDetailsModal.module.css";

export function SiteDetailsModal({
  site,
  onClose,
}: {
  site: ProductAnalyticsSite;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useGetProductAnalyticsSiteQuery(site.id);

  return (
    <Modal size="40rem" opened onClose={onClose} title={site.name}>
      <Stack gap="md">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <Stack gap="sm">
            <Text fw="bold">{t`Tracking snippet`}</Text>

            <CodeTextBlock codeClassName={S.CodeBlockText}>
              {data?.tracking_snippet ?? ""}
            </CodeTextBlock>
          </Stack>
        </DelayedLoadingAndErrorWrapper>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t`Close`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
