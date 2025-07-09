import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { push } from "react-router-redux";
import { t } from "ttag";

import UserAvatar from "metabase/common/components/UserAvatar";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Button, Card, Divider, Icon, Menu, Skeleton, Textarea } from "metabase/ui";

import { addChatMessage, addGenerativeQuestion, addNodeReviewer, addReviewer, createQuestionMetadata, generateSampleContent, getAvailableReviewers } from "../redux/generativeQuestionsSlice";
import { getGenerativeQuestionById } from "../redux/selectors";

import { MarkdownRenderer } from "./MarkdownRenderer";

interface QuestionResponsePageProps {
  params: {
    questionId: string;
  };
}

const QuestionResponsePage = ({
  params,
}: QuestionResponsePageProps): JSX.Element => {
  const { questionId } = params;
  const [isLoading, setIsLoading] = useState(true);
  const [showTitle, setShowTitle] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const dispatch = useDispatch();
  const currentUser = useSelector(getUser);
  const question = useSelector((state) =>
    getGenerativeQuestionById(state, questionId),
  );

  const handleStartNewQuestion = useCallback(
    (selectedText: string) => {
      const newQuestionId = crypto.randomUUID();

      dispatch(
        addGenerativeQuestion({
          id: newQuestionId,
          prompt: selectedText,
          agentType: "Metabot: Your general purpose analyst",
          content: generateSampleContent(selectedText),
          metadata: createQuestionMetadata(currentUser, "Metabot: Your general purpose analyst"),
          chatHistory: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );

      // Navigate to the new question using Redux router
      dispatch(push(`/questions/${newQuestionId}`));
    },
    [dispatch, currentUser],
  );

  // Use the prompt from the Redux store as the title
  const generatedTitle = question?.prompt || "Sales Performance Analysis for Q4 2023";
  const generatedContent = question?.content || "No content available";

  const handleTextNodeClick = (_nodeId: string, _text: string) => {
    // TODO: Implement follow-up question functionality
    // This could open a modal, add to chat, or highlight the text
    // For now, we can use the nodeId and text to generate follow-up questions
  };

  const handleSelectionChange = (_selectedNodes: string[]) => {
    // TODO: Handle selection changes
    // This could update the UI to show selection count, enable/disable actions, etc.
    // console.log("Selected nodes:", selectedNodes);
  };

  const handleAddToLibrary = useCallback(() => {
    // TODO: Implement add to library functionality
    // This could save the question to a user's personal collection
  }, []);



  const handleAddReviewer = useCallback((reviewer: { id: string; name: string; email: string; avatar?: string }) => {
    if (question) {
      dispatch(addReviewer({
        questionId: question.id,
        reviewer: {
          id: reviewer.id,
          name: reviewer.name,
          email: reviewer.email,
          avatar: reviewer.avatar,
          status: "requested",
          requestedAt: Date.now(),
        },
      }));
    }
  }, [dispatch, question]);

    const handleRequestNodeReview = useCallback((nodeId: string, text: string, reviewerId: string) => {
    if (question) {
      const availableReviewers = getAvailableReviewers();
      const reviewer = availableReviewers.find(r => r.id === reviewerId);

      if (reviewer) {
        dispatch(addNodeReviewer({
          questionId: question.id,
          nodeId,
          reviewer: {
            id: reviewer.id,
            name: reviewer.name,
            email: reviewer.email,
            avatar: reviewer.avatar,
            status: "requested",
            requestedAt: Date.now(),
          },
        }));

        // Show a simple notification (in a real app, this would be a toast)
        console.log(`Review requested for node "${text.substring(0, 50)}..." from ${reviewer.name}`);
      }
    }
  }, [dispatch, question]);

  const handleSendMessage = useCallback(async () => {
    if (!chatMessage.trim() || !question || isSendingMessage) return;

    setIsSendingMessage(true);
    const messageId = `msg-${Date.now()}`;
    const timestamp = Date.now();

    // Add user message
    dispatch(addChatMessage({
      questionId: question.id,
      message: {
        id: messageId,
        role: "user",
        content: chatMessage.trim(),
        timestamp,
      },
    }));

    setChatMessage("");

    // Simulate AI response
    setTimeout(() => {
      const aiResponseId = `msg-${Date.now()}`;
      const aiResponse = generateAIResponse(chatMessage.trim(), question.agentType);

      dispatch(addChatMessage({
        questionId: question.id,
        message: {
          id: aiResponseId,
          role: "assistant",
          content: aiResponse,
          timestamp: Date.now(),
        },
      }));

      setIsSendingMessage(false);
    }, 1000);
  }, [chatMessage, question, isSendingMessage, dispatch]);

  const generateAIResponse = (userMessage: string, agentType: string): string => {
    // Simple response generation based on message content and agent type
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("cost") || lowerMessage.includes("budget") || lowerMessage.includes("price")) {
      return "Based on the analysis, here are the cost implications:\n\n**Implementation Costs:**\n- Infrastructure scaling: $30K/month during peak\n- Additional staff: $120K/year\n- Technology upgrades: $50K one-time\n\n**Expected ROI:**\n- Revenue increase: 15-25%\n- Payback period: 8-12 months\n- 3-year ROI: 200-300%";
    }

    if (lowerMessage.includes("timeline") || lowerMessage.includes("schedule") || lowerMessage.includes("when")) {
      return "Here's a recommended timeline:\n\n**Phase 1 (Months 1-2):**\n- Infrastructure assessment\n- Team training\n- Pilot implementation\n\n**Phase 2 (Months 3-4):**\n- Full deployment\n- Monitoring setup\n- Performance optimization\n\n**Phase 3 (Months 5-6):**\n- Scale up operations\n- Process refinement\n- Success measurement";
    }

    if (lowerMessage.includes("risk") || lowerMessage.includes("challenge") || lowerMessage.includes("problem")) {
      return "Key risks and mitigation strategies:\n\n**Primary Risks:**\n- Data migration complexity\n- User adoption resistance\n- Integration challenges\n\n**Mitigation:**\n- Comprehensive testing plan\n- Change management program\n- Phased rollout approach\n- Regular stakeholder communication";
    }

    // Default response
    return `Thank you for your question. As your ${agentType}, I can help you dive deeper into this analysis. Could you please specify what aspect you'd like me to focus on? I can provide more detailed insights on costs, timelines, risks, or any other specific area.`;
  };

  const getReviewStatusColor = (status: string) => {
    switch (status) {
      case "requested": return "var(--mb-color-warning)";
      case "commented": return "var(--mb-color-info)";
      case "verified": return "var(--mb-color-success)";
      case "problematic": return "var(--mb-color-error)";
      default: return "var(--mb-color-text-medium)";
    }
  };

  const availableReviewers = getAvailableReviewers();
  const currentReviewers = question?.metadata?.reviewers || [];

  // Helper function to get reviewers for specific nodes
  const getNodeReviewers = useCallback(() => {
    if (!question?.metadata?.reviewers) return {};

    const nodeReviewers: Record<string, Array<{ id: string; name: string; status: string }>> = {};
    question.metadata.reviewers.forEach(reviewer => {
      if (reviewer.nodeId) {
        if (!nodeReviewers[reviewer.nodeId]) {
          nodeReviewers[reviewer.nodeId] = [];
        }
        nodeReviewers[reviewer.nodeId].push({
          id: reviewer.id,
          name: reviewer.name,
          status: reviewer.status,
        });
      }
    });
    return nodeReviewers;
  }, [question?.metadata?.reviewers]);

  useEffect(() => {
    // Simulate loading time
    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
      // Show title after a short delay
      setTimeout(() => setShowTitle(true), 300);
      // Show content after title appears
      setTimeout(() => setShowContent(true), 600);
    }, 1500);

    return () => clearTimeout(loadingTimer);
  }, []);

  // Auto-scroll chat to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [question?.chatHistory?.length]);

  return (
    <div
      style={{
        height: "calc(100vh - 60px)", // Account for header
        opacity: isLoading ? 0 : 1,
        transition: "opacity 0.5s ease-in-out",
      }}
    >
      <PanelGroup direction="horizontal" style={{ height: "100%" }}>
        <Panel defaultSize={70} minSize={30}>
          <div
            style={{
              height: "100%",
              padding: "2rem",
              overflowY: "auto",
              opacity: showContent ? 1 : 0,
              transform: showContent ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
            }}
          >
        <Card shadow="none" withBorder>
          <div style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              {showTitle ? (
                <h1
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: "600",
                    opacity: 1,
                    transform: "translateY(0)",
                    transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {generatedTitle}
                </h1>
              ) : (
                <Skeleton
                  height={32}
                  width="60%"
                  style={{ margin: 0, flex: 1 }}
                />
              )}

              {/* Action Button */}
              <Menu>
                <Menu.Target>
                  <Button
                    variant="subtle"
                    size="sm"
                    style={{
                      marginLeft: "1rem",
                      opacity: showTitle ? 1 : 0,
                      transition: "opacity 0.4s ease-out",
                    }}
                  >
                    {t`Actions`}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={handleAddToLibrary}>
                    {t`Add to library`}
                  </Menu.Item>
                  <Menu trigger="click-hover" position="right" width={200}>
                    <Menu.Target>
                      <Menu.Item
                        fw="bold"
                        styles={{
                          item: {
                            backgroundColor: "transparent",
                            color: "var(--mb-color-text-primary)",
                          },
                          itemSection: {
                            color: "var(--mb-color-text-primary)",
                          },
                        }}
                        rightSection={<Icon name="chevronright" aria-hidden />}
                      >
                        {t`Ask for a review`}
                      </Menu.Item>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {availableReviewers
                        .filter(reviewer => !currentReviewers.find(r => r.id === reviewer.id))
                        .map(reviewer => (
                          <Menu.Item
                            key={reviewer.id}
                            onClick={() => handleAddReviewer(reviewer)}
                            leftSection={
                              <UserAvatar
                                user={{
                                  first_name: reviewer.name.split(' ')[0],
                                  last_name: reviewer.name.split(' ').slice(1).join(' '),
                                  common_name: reviewer.name,
                                  email: reviewer.email,
                                }}
                              />
                            }
                          >
                            {reviewer.name}
                          </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                  </Menu>
                </Menu.Dropdown>
              </Menu>

              {/* Reviews Menu */}
              {currentReviewers.length > 0 && (
                <Menu>
                  <Menu.Target>
                    <Button
                      variant="subtle"
                      size="sm"
                      style={{
                        marginLeft: "0.5rem",
                        opacity: showTitle ? 1 : 0,
                        transition: "opacity 0.4s ease-out",
                      }}
                    >
                      {t`Reviews`} ({currentReviewers.length})
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {currentReviewers.map(reviewer => (
                      <Menu.Item
                        key={reviewer.id}
                        leftSection={
                          <div style={{ position: "relative" }}>
                            <UserAvatar
                              user={{
                                first_name: reviewer.name.split(' ')[0],
                                last_name: reviewer.name.split(' ').slice(1).join(' '),
                                common_name: reviewer.name,
                                email: reviewer.email,
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                bottom: 0,
                                right: 0,
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: getReviewStatusColor(reviewer.status),
                                border: "2px solid white",
                              }}
                            />
                          </div>
                        }
                      >
                        <div>
                          <div style={{ fontWeight: "500" }}>{reviewer.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--mb-color-text-medium)" }}>
                            {reviewer.status.charAt(0).toUpperCase() + reviewer.status.slice(1)}
                            {reviewer.nodeId && (
                              <span style={{ marginLeft: "0.5rem", fontStyle: "italic" }}>
                                (node review)
                              </span>
                            )}
                          </div>
                        </div>
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              )}
            </div>
            {/* Authors Info */}
            {question?.metadata?.authors && question.metadata.authors.length > 0 && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {question.metadata.authors.map((author) => (
                    <span
                      key={author.id}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                      }}
                    >
                      {author.name}
                      {author.role && (
                        <span style={{ marginLeft: "0.25rem", opacity: 0.8 }}>
                          ({author.role})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Divider />
            <div
              style={{
                opacity: showContent ? 1 : 0,
                transform: showContent ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
                transitionDelay: "0.2s",
              }}
            >
              <MarkdownRenderer
                content={generatedContent}
                onTextNodeClick={handleTextNodeClick}
                onSelectionChange={handleSelectionChange}
                onStartNewQuestion={handleStartNewQuestion}
                onRequestNodeReview={handleRequestNodeReview}
                nodeReviewers={getNodeReviewers()}
                availableReviewers={availableReviewers}
              />
            </div>
          </div>
        </Card>
        </div>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            backgroundColor: "var(--mb-color-border)",
            cursor: "col-resize",
            transition: "background-color 0.2s ease",
          }}
        />

        <Panel defaultSize={30} minSize={20}>
          <div
            style={{
              height: "100%",
              padding: "2rem",
              overflowY: "auto",
              opacity: showContent ? 1 : 0,
              transform: showContent ? "translateX(0)" : "translateX(20px)",
              transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
              transitionDelay: "0.3s",
            }}
          >
            <Card shadow="none" withBorder>
              <div style={{ padding: "1rem" }}>
                <h3
                  style={{
                    marginBottom: "1rem",
                    fontSize: "1.1rem",
                    fontWeight: "600",
                  }}
                >
                  {t`Agent Chat`}
                </h3>

                {/* Prompt Card */}
                <Card
                  shadow="none"
                  withBorder
                  style={{
                    marginBottom: "1rem",
                    backgroundColor: "var(--mb-color-bg-light)",
                  }}
                >
                  <div style={{ padding: "0.75rem" }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--mb-color-text-medium)",
                        marginBottom: "0.25rem",
                        fontWeight: "500",
                      }}
                    >
                      {t`Question`}
                    </div>
                    <div style={{ fontSize: "0.875rem", lineHeight: "1.4" }}>
                      {question?.prompt || t`No question available`}
                    </div>
                  </div>
                </Card>
                <div
                  ref={chatContainerRef}
                  style={{
                    height: "400px",
                    border: "1px solid var(--mb-color-border)",
                    borderRadius: "0.375rem",
                    padding: "0.75rem",
                    marginBottom: "1rem",
                    overflowY: "auto",
                    backgroundColor: "var(--mb-color-bg-light)",
                  }}
                >
                  {question?.chatHistory?.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        marginBottom: "1rem",
                        padding: "0.5rem",
                        borderRadius: "0.375rem",
                        backgroundColor: message.role === "user" ? "var(--mb-color-primary)" : "var(--mb-color-bg-white)",
                        color: message.role === "user" ? "white" : "var(--mb-color-text-primary)",
                        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        marginLeft: message.role === "user" ? "auto" : "0",
                        marginRight: message.role === "user" ? "0" : "auto",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", marginBottom: "0.25rem", opacity: 0.8 }}>
                        {message.role === "user" ? "You" : question?.agentType || "Assistant"}
                      </div>
                      <div style={{ fontSize: "0.875rem", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>
                        {message.content}
                      </div>
                      <div style={{ fontSize: "0.625rem", marginTop: "0.25rem", opacity: 0.6 }}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                  {isSendingMessage && (
                    <div
                      style={{
                        padding: "0.5rem",
                        borderRadius: "0.375rem",
                        backgroundColor: "var(--mb-color-bg-white)",
                        maxWidth: "85%",
                        marginRight: "auto",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", marginBottom: "0.25rem", opacity: 0.8 }}>
                        {question?.agentType || "Assistant"}
                      </div>
                      <div style={{ fontSize: "0.875rem", fontStyle: "italic", opacity: 0.7 }}>
                        {t`Typing...`}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Textarea
                    placeholder={t`Ask a follow-up question...`}
                    minRows={2}
                    maxRows={4}
                    style={{ flex: 1 }}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    style={{ alignSelf: "flex-end" }}
                    onClick={handleSendMessage}
                    disabled={!chatMessage.trim() || isSendingMessage}
                  >
                    {isSendingMessage ? t`Sending...` : t`Send`}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionResponsePage;
