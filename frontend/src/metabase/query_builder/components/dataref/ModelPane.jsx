import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";
import Expandable from "metabase/components/Expandable";
import Question from "metabase/entities/questions";

const mapStateToProps = (state, ownProps) => ({
  questionId: ownProps.model.id,
  question: Question.selectors.getObject(state, {
    entityId: ownProps.model.id,
  }),
});

class ModelPane extends React.Component {
  state = {
    error: null,
  };

  static propTypes = {
    query: PropTypes.object.isRequired,
    show: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    setCardAndRun: PropTypes.func.isRequired,
    questionId: PropTypes.number.isRequired,
    question: PropTypes.object,
    // fetchForeignKeys: PropTypes.func.isRequired,
    // fetchMetadata: PropTypes.func.isRequired,
  };

  async UNSAFE_componentWillMount() {
    try {
      await Promise.all([
        // this.props.fetchForeignKeys({ id: this.props.tableId }),
        // this.props.fetchMetadata({ id: this.props.tableId }),
      ]);
    } catch (e) {
      this.setState({
        error: t`An error occurred loading the table`,
      });
    }
  }

  render() {
    const { question } = this.props;
    const { error } = this.state;
    if (question) {
      return (
        <div>
          <div className="ml1">
            <div>{question.desceription || "No description"}</div>
            <div>{`#${question.id}`}</div>
            <div>{`Last edited ${formatDate(question.updated_at)}`}</div>
            {question.result_metadata && (
              <div className="my2 text-uppercase">
                <ul>
                  {question.result_metadata.map((item, index) => (
                    <li key={item.id}>
                      <a
                        onClick={() => this.props.show("modelColumn", item)}
                        className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                      >
                        {item.display_name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return <div>{error}</div>;
    }
  }
}

export default connect(mapStateToProps)(ModelPane);

const ExpandableItemList = Expandable(
  ({ name, type, show, items, isExpanded, onExpand }) => (
    <div className="mb2">
      <div className="text-bold mb1">{name}</div>
      <ul>
        {items.map((item, index) => (
          <ListItem key={item.id} onClick={() => show(item)}>
            {item.name}
          </ListItem>
        ))}
        {!isExpanded && <ListItem onClick={onExpand}>{t`More`}...</ListItem>}
      </ul>
    </div>
  ),
);

ExpandableItemList.propTypes = {
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  show: PropTypes.func.isRequired,
  items: PropTypes.array.isRequired,
  onExpand: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
};

const ListItem = ({ onClick, children }) => (
  <li className="py1 border-row-divider">
    <a className="text-brand no-decoration" onClick={onClick}>
      {children}
    </a>
  </li>
);

ListItem.propTypes = {
  children: PropTypes.any,
  onClick: PropTypes.func,
};

// This formats a timestamp as a date using any custom formatting options.
function formatDate(value) {
  const options = MetabaseSettings.get("custom-formatting")["type/Temporal"];
  return formatDateTimeWithUnit(value, "day", options);
}
