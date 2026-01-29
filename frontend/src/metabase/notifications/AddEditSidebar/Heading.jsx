import PropTypes from "prop-types";

const Heading = ({ children }) => <h4>{children}</h4>;

Heading.propTypes = { children: PropTypes.any };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Heading;
