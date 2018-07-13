import ItemSelect from "./ItemSelect";

import QuestionPicker from "./QuestionPicker";
import QuestionName from "./QuestionName";

const QuestionSelect = ItemSelect(QuestionPicker, QuestionName, "question");

export default QuestionSelect;
