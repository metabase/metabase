import ItemSelect from "./ItemSelect";

import CollectionPicker from "./CollectionPicker";
import CollectionName from "./CollectionName";

const QuestionSelect = ItemSelect(
  CollectionPicker,
  CollectionName,
  "collection",
);

export default QuestionSelect;
