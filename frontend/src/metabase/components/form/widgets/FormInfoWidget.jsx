import PropTypes from "prop-types";
import Banner from "metabase/components/Banner";

const propTypes = {
  placeholder: PropTypes.string,
};

const FormInfoWidget = ({ placeholder }) => <Banner>{placeholder}</Banner>;

FormInfoWidget.propTypes = propTypes;

export default FormInfoWidget;
