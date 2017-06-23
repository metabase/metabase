/* eslint "react/prop-types": "warn" */

import React, { Component } from 'react';
import PropTypes from "prop-types";

import MetabaseSettings from "metabase/lib/settings";
import VisualizationErrorMessage from './VisualizationErrorMessage';

const EmailAdmin = () => {
  const adminEmail = MetabaseSettings.adminEmail()
  return adminEmail && (
      <span className="QueryError-adminEmail">
          <a className="no-decoration" href={`mailto:${adminEmail}`}>
              {adminEmail}
          </a>
      </span>
  )
}

class VisualizationError extends Component {

  constructor(props) {
      super(props);
      this.state = {
          showError: false
      }
  }
  static propTypes = {
      card:     PropTypes.object.isRequired,
      duration: PropTypes.number.isRequired,
      error:    PropTypes.object.isRequired,
  }

  render () {
      const { card, duration, error } = this.props
      if (typeof error.status === "number") {
          // Assume if the request took more than 15 seconds it was due to a timeout
          // Some platforms like Heroku return a 503 for numerous types of errors so we can't use the status code to distinguish between timeouts and other failures.
          if (duration > 15*1000) {
              return <VisualizationErrorMessage
                        type="timeout"
                        title="Your question took too long"
                        message="We didn't get an answer back from your database in time, so we had to stop. You can try again in a minute, or if the problem persists, you can email an admin to let them know."
                        action={<EmailAdmin />}
                    />
          } else {
              return <VisualizationErrorMessage
                        type="serverError"
                        title="We're experiencing server issues"
                        message="Try refreshing the page after waiting a minute or two. If the problem persists we'd recommend you contact an admin."
                        action={<EmailAdmin />}
                    />
          }
      } else if (card.dataset_query && card.dataset_query.type === 'native') {
          // always show errors for native queries
          return (
              <div className="QueryError flex full align-center text-error">
                  <div className="QueryError-iconWrapper">
                      <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                          <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                      </svg>
                  </div>
                  <span className="QueryError-message">{error}</span>
              </div>
          );
      } else {
          return (
              <div className="QueryError2 flex full justify-center">
                  <div className="QueryError-image QueryError-image--queryError mr4"></div>
                  <div className="QueryError2-details">
                      <h1 className="text-bold">There was a problem with your question</h1>
                      <p className="QueryError-messageText">Most of the time this is caused by an invalid selection or bad input value.  Double check your inputs and retry your query.</p>
                      <div className="pt2">
                          <a onClick={() => this.setState({ showError: true })} className="link cursor-pointer">Show error details</a>
                      </div>
                      <div style={{ display: this.state.showError? 'inherit': 'none'}} className="pt3 text-left">
                          <h2>Here's the full error message</h2>
                          <div style={{fontFamily: "monospace"}} className="QueryError2-detailBody bordered rounded bg-grey-0 text-bold p2 mt1">{error}</div>
                      </div>
                  </div>
              </div>
          );
      }
  }
}

export default VisualizationError
