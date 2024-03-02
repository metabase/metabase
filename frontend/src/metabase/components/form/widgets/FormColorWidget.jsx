/* eslint-disable react/prop-types */
import ColorSelector from "metabase/core/components/ColorSelector";
import { getAccentColors } from "metabase/lib/colors/groups";

const FormColorWidget = ({ field, initial }) => (
  <div>
    <ColorSelector
      {...field}
      value={field.value || initial()}
      colors={getAccentColors()}
    />
  </div>
);

export default FormColorWidget;
