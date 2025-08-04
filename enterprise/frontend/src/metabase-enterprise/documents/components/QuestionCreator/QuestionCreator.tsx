import { useState } from "react";

import Link from "metabase/common/components/Link";
import { Box, Button, Flex, Loader, Text } from "metabase/ui";

import { useCreateAgenticQuestionMutation } from "../../../api/document";

export const QuestionCreator = () => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [createQuestion, { isLoading }] = useCreateAgenticQuestionMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    try {
      const result = await createQuestion({
        prompt: prompt.trim(),
        auto_execute: true,
      }).unwrap();

      setResponse(result);
    } catch (error) {
      setResponse({
        error: true,
        message: error instanceof Error ? error.message : "An error occurred",
        details: error,
      });
    }
  };

  return (
    <Box p="xl" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Flex direction="column" gap="lg">
        <Text size="xl" fw="bold">
          Agentic Question Creator
        </Text>

        <Box
          p="md"
          style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}
        >
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="md">
              <div>
                <Text size="sm" fw="500" mb="xs">
                  Enter your data request
                </Text>
                <input
                  type="text"
                  placeholder="e.g., Show me the most ordered products"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <Flex justify="flex-end">
                <Button
                  type="submit"
                  loading={isLoading}
                  disabled={!prompt.trim()}
                >
                  Create Question
                </Button>
              </Flex>
            </Flex>
          </form>
        </Box>

        {isLoading && (
          <Box
            p="md"
            style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}
          >
            <Flex align="center" gap="sm">
              <Loader size="sm" />
              <Text>Creating question from your prompt...</Text>
            </Flex>
          </Box>
        )}

        {response && !isLoading && (
          <Box
            p="md"
            style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}
          >
            <Flex direction="column" gap="sm">
              <Text size="lg" fw="500">
                Response:
              </Text>

              {response.error ? (
                <Box>
                  <Text c="red" fw="500">
                    Error:
                  </Text>
                  <Text>{response.message}</Text>
                  {response.details && (
                    <Box mt="sm">
                      <Text size="sm" c="dimmed">
                        Details:
                      </Text>
                      <Text size="sm" style={{ fontFamily: "monospace" }}>
                        {JSON.stringify(response.details, null, 2)}
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box>
                  {response.question_id ? (
                    <>
                      <Text c="green" fw="500">
                        Success!
                      </Text>
                      <Link to={`/question/${response.question_id}`}>
                        Question ID: {response.question_id}
                      </Link>
                      <Text>{response.message}</Text>
                      {response.metadata && (
                        <Box mt="sm">
                          <Text size="sm" c="dimmed">
                            Metadata:
                          </Text>
                          <pre
                            style={{
                              fontSize: "12px",
                              background: "#f5f5f5",
                              padding: "8px",
                              borderRadius: "4px",
                              overflow: "auto",
                            }}
                          >
                            {JSON.stringify(response.metadata, null, 2)}
                          </pre>
                        </Box>
                      )}
                    </>
                  ) : (
                    <>
                      <Text c="orange" fw="500">
                        No question created
                      </Text>
                      <Text>{response.message}</Text>
                    </>
                  )}
                </Box>
              )}
            </Flex>
          </Box>
        )}
      </Flex>
    </Box>
  );
};
