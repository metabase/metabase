import { useCreateLinkMutation } from "metabase/api/link";
import type { TypeWithModel } from "metabase/common/components/EntityPicker";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import type { LinkId, SearchModel } from "metabase-types/api";


export function CreateLinkModal({
  target, onClose,
}: {
  target: TypeWithModel<LinkId, SearchModel>; onClose: () => void
}) {
  const [createLink] = useCreateLinkMutation();

  const handleChange = async (item: TypeWithModel<LinkId, SearchModel>) => {
    await createLink({
      target_model: target.model,
      name: target.name,
      target_id: target.id,
      collection_id: item.id,
    });
    onClose();
  };

  return (
    <CollectionPickerModal
      title="Where should we place the link?"
      onClose={onClose}
      value={{ id: 'root', model: 'collection', collection_id: null }}
      onChange={handleChange}
    />
  );
}
