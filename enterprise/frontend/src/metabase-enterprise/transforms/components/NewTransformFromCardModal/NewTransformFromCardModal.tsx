import { push } from "react-router-redux";

import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";

import { getNewTransformFromCardPageUrl } from "../../../urls";

type NewTransformFromCardModalProps = {
  onClose: () => void;
};

export function NewTransformFromCardModal({
  onClose,
}: NewTransformFromCardModalProps) {
  const dispatch = useDispatch();

  const handleChange = (item: QuestionPickerValueItem) => {
    dispatch(push(getNewTransformFromCardPageUrl(item.id)));
  };

  return <QuestionPickerModal onChange={handleChange} onClose={onClose} />;
}
