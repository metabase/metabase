import { useGetActionQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ActionTest } from "metabase-types/api";

type ActionLinkProps = {
  test: ActionTest;
};

export function ActionLink({ test }: ActionLinkProps) {
  const { data: action } = useGetActionQuery({ id: test.action_id });

  if (action == null) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name="bolt" c="core-brand" />
      <Anchor component={ForwardRefLink} to={Urls.dataStudioAction(action.id)}>
        {action.name}
      </Anchor>
    </Group>
  );
}
