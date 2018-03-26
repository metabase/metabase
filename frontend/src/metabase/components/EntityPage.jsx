import React, { Component } from "react";
import { Box, Flex } from "rebass";
import { Link } from "react-router";

import { PageSidebar, Wrapper } from "./EntityLayout";

import Icon from "metabase/components/Icon"
import EntityInfo from "./EntityInfo";
import EntitySegments from "./EntitySegments";

import Visualization from "metabase/visualizations/components/Visualization";
import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";

class EntityPage extends Component {
  render() {
    return (
      <QuestionAndResultLoader
        questionId={this.props.params.cardId}
        questionHash={this.props.location.hash}
      >
        {({ question, result, cancel, reload, rawSeries }) => {

          if (!question) {
            return <div>"Loading..."</div>;
          }

          const mode = question.mode && question.mode();
          const actions = mode && mode.actions();

          return (
            <div key="entity">
              <Box
                className="border-bottom"
                style={{ backgroundColor: "#FCFDFD", height: "65vh" }}
              >
                { rawSeries && (
                    <Visualization
                      className="full-height"
                      rawSeries={rawSeries}
                    />

                )}
              </Box>
              <a onClick={() => reload()}>Reload</a>
              <a onClick={() => cancel()}>Cancel</a>
              <Box>
                <Wrapper>
                  <Flex>
                    <EntityInfo entity={question} />
                    <PageSidebar>
                      <Box
                        p={2}
                        mt={4}
                        style={{ border: "1px solid #ddd", borderRadius: 6 }}
                      >
                        <Box>
                          <h3>Ways to view this</h3>
                          <ol>
                            {actions &&
                              actions.map(action => (
                                <li className="bordered rounded bg-white p1 inline-block">
                                  {action.question && (
                                    <Link to={action.question().getUrl()}>
                                      {action.title}
                                    </Link>
                                  )}
                                </li>
                              ))}
                          </ol>
                        </Box>
                        <EntitySegments question={question} />
                      </Box>
                    </PageSidebar>
                  </Flex>
                </Wrapper>
              </Box>
            </div>
          );
        }}
      </QuestionAndResultLoader>
    );
  }
}

export default EntityPage;
