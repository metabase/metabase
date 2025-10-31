import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useListTransformsQuery } from "metabase-enterprise/api";
import type { TransformId } from "metabase-types/api";

import { SidebarList } from "../SidebarList";
import { TransformListItem } from "../SidebarListItem/TransformListItem";

interface TransformsListProps {
  selectedTransformId?: TransformId;
}

export const TransformsList = ({
  selectedTransformId,
}: TransformsListProps) => {
  const { data: transforms, error, isLoading } = useListTransformsQuery({});

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!transforms || transforms.length === 0) {
    return null;
  }

  return (
    <SidebarList>
      {transforms.map((transform) => (
        <TransformListItem
          key={transform.id}
          transform={transform}
          selectedId={selectedTransformId}
        />
      ))}
    </SidebarList>
  );
};
