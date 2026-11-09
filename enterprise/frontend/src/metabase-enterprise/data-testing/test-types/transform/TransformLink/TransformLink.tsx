import { useGetTransformQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformTest } from "metabase-types/api";

type TransformLinkProps = {
  test: TransformTest;
};

export function TransformLink({ test }: TransformLinkProps) {
  const { data: transform } = useGetTransformQuery(test.transform_id);

  if (transform == null) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name="transform" c="core-brand" />
      <Anchor component={ForwardRefLink} to={Urls.transform(transform.id)}>
        {transform.name}
      </Anchor>
    </Group>
  );
}
