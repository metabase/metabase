import React from "react";
import { CardApi } from "metabase/services";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";

const RelatedDashboards = ({ dashboards }) => (
  <div className="my2">
    <h2>Dashboards this appears in</h2>
    <ol>
      {dashboards.map(dashboard => (
        <li className="bordered rounded p3 shadowed mb1" key={dashboard.id}>
          <Link
            to={Urls.dashboard(dashboard.id)}
            className="flex align-center link"
          >
            <Icon name="dashboard" className="mr1" />
            <h3>{dashboard.name}</h3>
          </Link>
        </li>
      ))}
    </ol>
  </div>
);

const RelatedDashCards = ({ cards }) => (
  <div className="my2">
    <h2>This question is in dashboards with</h2>
    <ol>
      {cards.map(card => (
        <li className="bordered rounded p1" key={card.id}>
          <Link to={Urls.question(card.id)} className="link">
            <h3>{card.name}</h3>
          </Link>
        </li>
      ))}
    </ol>
  </div>
);

class RelatedItems extends React.Component {
  state = {
    loading: false,
    relatedItems: null,
    error: null,
  };

  componentWillMount() {
    const { questionId, questionHash } = this.props;
    if (this.props.questionId) {
      this._loadRelatedForCard(questionId);
    }

    if (this.props.questionHash) {
      this._loadRelatedForQuery(questionHash);
    }
  }

  componentDidUpdate(nextProps) {
    if (nextProps.questionId !== this.props.questionId) {
      this._loadRelatedForCard(nextProps.questionId);
    }

    if (nextProps.questionHash !== this.props.questionHash) {
      this._loadRelatedForQuery(nextProps.questionHash);
    }
  }

  async _loadRelatedForCard(cardId) {
    this.setState({ loading: true });

    const relatedItems = await CardApi.related({ cardId });

    if (relatedItems) {
      this.setState({ relatedItems, loading: false, error: false });
    }
  }

  async _loadRelatedForQuery(questionHash) {
    this.setState({ loading: true });

    const relatedItems = await CardApi.adHocRelated(questionHash);

    if (relatedItems) {
      this.setState({
        relatedItems,
        loading: false,
        error: false,
      });
    }
  }

  render() {
    const { relatedItems } = this.state;
    if (this.state.loading || !relatedItems) {
      return <div>"Loading"</div>;
    }
    if (this.state.error) {
      return <div>Sometihng was wrong</div>;
    }

    return (
      <div className="my2">
        <h1>Related Items</h1>

        {relatedItems && (
          <div>
            {relatedItems["dashboards"] && (
              <RelatedDashboards dashboards={relatedItems["dashboards"]} />
            )}
            {relatedItems["dashboard-mates"] && (
              <RelatedDashCards cards={relatedItems["dashboard-mates"]} />
            )}
          </div>
        )}
      </div>
    );
  }
}

export default RelatedItems;
