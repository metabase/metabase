import React, { Component } from "react";
import PropTypes from "prop-types";

import MetabaseAnalytics from "metabase/lib/analytics";
import AddToDashboard from "metabase/questions/containers/AddToDashboard.jsx";

export default class AddToDashSelectQuestionModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      error: null,
    };
  }

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    cards: PropTypes.array,

    fetchCards: PropTypes.func.isRequired,
    addCardToDashboard: PropTypes.func.isRequired,
    onEditingChange: PropTypes.func.isRequired,

    onClose: PropTypes.func.isRequired,
  };

  async componentDidMount() {
    try {
      await this.props.fetchCards();
    } catch (error) {
      console.error(error);
      this.setState({ error });
    }
  }

  onAdd = cardId => {
    this.props.addCardToDashboard({
      dashId: this.props.dashboard.id,
      cardId: cardId,
    });
    this.props.onEditingChange(true);
    this.props.onClose();
    MetabaseAnalytics.trackEvent("Dashboard", "Add Card");
  };

  render() {
    return <AddToDashboard onAdd={this.onAdd} onClose={this.props.onClose} />;
  }
}
