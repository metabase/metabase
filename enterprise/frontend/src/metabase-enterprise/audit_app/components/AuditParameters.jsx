import PropTypes from "prop-types";
import { Component } from "react";
import _ from "underscore";

import { Box, Button, Group, Input, ScrollArea } from "metabase/ui";

const DEBOUNCE_PERIOD = 300;

const propTypes = {
  parameters: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      placeholder: PropTypes.string.isRequired,
    }),
  ),
  buttons: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      onClick: PropTypes.func.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  children: PropTypes.func,
  hasResults: PropTypes.bool,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class AuditParameters extends Component {
  constructor(props) {
    super(props);
    this.state = {
      inputValues: {},
      committedValues: {},
    };
  }

  changeValue = (key, value) => {
    this.setState({
      inputValues: { ...this.state.inputValues, [key]: value },
    });
    this.commitValueDebounced(key, value);
  };

  commitValueDebounced = _.debounce((key, value) => {
    this.setState({
      committedValues: { ...this.state.committedValues, [key]: value },
    });
  }, DEBOUNCE_PERIOD);

  render() {
    const { parameters, children, buttons, hasResults } = this.props;
    const { inputValues, committedValues } = this.state;

    const isEmpty =
      hasResults === false &&
      inputValues &&
      Object.values(inputValues).every((v) => v === "");

    return (
      <Box>
        <div>
          <Group grow>
            {parameters.map(({ key, placeholder, icon, disabled }) => (
              <Input
                key={key}
                type="text"
                value={inputValues[key] || ""}
                placeholder={placeholder}
                disabled={isEmpty || disabled}
                onChange={(e) => {
                  this.changeValue(key, e.target.value);
                }}
                icon={icon}
              />
            ))}
            {buttons?.map(({ key, label, disabled, onClick }) => (
              <Button
                key={key}
                variant="filled"
                disabled={isEmpty || disabled}
                onClick={onClick}
              >
                {label}
              </Button>
            ))}
          </Group>
        </div>
        <ScrollArea>{children && children(committedValues)}</ScrollArea>
      </Box>
    );
  }
}

AuditParameters.propTypes = propTypes;
