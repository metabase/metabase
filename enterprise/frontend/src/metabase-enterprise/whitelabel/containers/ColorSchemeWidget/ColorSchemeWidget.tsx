import { connect } from "react-redux";
import { originalColors } from "../../lib/whitelabel";
import ColorSchemeWidget from "../../components/ColorSchemeWidget";
import { State } from "metabase-types/store";

interface ColorSchemeSetting {
  value?: Record<string, string>;
}

interface ColorSchemeWidgetProps {
  setting: ColorSchemeSetting;
}

const mapStateToProps = (state: State, props: ColorSchemeWidgetProps) => ({
  initialColors: props.setting.value,
  originalColors,
});

export default connect(mapStateToProps)(ColorSchemeWidget);
