import { useEffect, useState, useRef } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
import ChatMessageList from "metabase/components/ChatMessageList/ChatMessageList";
import FeedbackDialog from "metabase/components/FeedbackDialog/FeedbackDialog";
import CubeRequestDialog from "metabase/components/CubeRequest/CubeRequestDialog";
import { ChatCardApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import { push } from "react-router-redux";
import Modal from "metabase/components/Modal";
import { generateRandomId } from "metabase/lib/utils";
import {
    adhocQuestionHash
} from "e2e/support/helpers/e2e-ad-hoc-question-helpers";
import { useSelector } from "metabase/lib/redux";
import { getDBInputValue, getInsightDBInputValue } from "metabase/redux/initialDb";
import { getInitialSchema, getInitialInsightSchema } from "metabase/redux/initialSchema";
import { useListDatabasesQuery, useGetDatabaseMetadataWithoutParamsQuery, skipToken } from "metabase/api";
import { t } from "ttag";
import toast from 'react-hot-toast';
import { useSetting } from "metabase/common/hooks";


const ChatAssistant = ({ metabase_id_back, client, clientSmith, selectedMessages, selectedThreadId, setSelectedThreadId, chatType, initial_message, setInitialMessage, setMessages, setInputValue, setThreadId, threadId, inputValue, messages, isChatHistoryOpen, setShowButton, setShouldRefetchHistory, modelSchema }) => {
    const siteName = useSetting("site-name");
    const formattedSiteName = siteName
        ? siteName.replace(/\s+/g, "_").toLowerCase()
        : "";
    const initialDbName = useSelector(getDBInputValue);
    const initialCompanyName = formattedSiteName;
    const initialSchema = useSelector(getInitialSchema);
    const initialInsightDbName = useSelector(getInsightDBInputValue);
    const initialInsightSchema = useSelector(getInitialInsightSchema)
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const [agent, setAgent] = useState(null);    // For managing the Assistant Agent
    const [thread, setThread] = useState(null);  // To store the created thread
    const [companyName, setCompanyName] = useState("");
    const [card, setCard] = useState([]);
    const [sources, setSources] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null)
    const [result, setResult] = useState([]);
    const [defaultQuestion, setDefaultQuestion] = useState([]);
    const [codeQuery, setCodeQuery] = useState([]);
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [dbInputValue, setDBInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState("reasoning");
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [isCubeRequestDialogOpen, setIsCbubeRequestDialogOpen] = useState(false);
    const [cardHash, setCardHash] = useState([]);
    const [id, setId] = useState(0);
    const [showError, setShowError] = useState(false);
    const [error, setError] = useState(null);
    const [approvalChangeButtons, setApprovalChangeButtons] = useState(false);
    const [visualizationIndex, setVisualizationIndex] = useState(-1);
    const [inisghtPlan, setInisghtPlan] = useState([]);
    const [insightCellCode, setInsightCellCode] = useState([]);
    const [insightsCode, setInsightsCode] = useState([]);
    const [insightsImg, setInsightsImg] = useState([]);
    const [progressShow, setProgressShow] = useState(false);
    const [insightsText, setInsightsText] = useState([]);
    const [finalMessages, setFinalMessages] = useState([]);
    const [finalMessagesText, setFinalMessagesText] = useState([]);
    const [runId, setRunId] = useState('');
    const [codeInterpreterThreadId, setCodeInterpreterThreadId] = useState('');
    const [schema, setSchema] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const { data, isLoading: dbLoading, error: dbError } = useListDatabasesQuery();
    const [selectedHash, setSelectedHash] = useState(null)
    const [showCubeEditButton, setShowCubeEditButton] = useState(false)
    const [requestedFields, setRequestedFields] = useState([]);
    const [pendingInfoMessage, setPendingInfoMessage] = useState(null);
    const [insightDB, setInsightDB] = useState(null);
    const [chatDisabled, setChatDisabled] = useState(false);
    const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [manualCancel, setManualCancel] = useState(false)

    const databases = data?.data;
    useEffect(() => {
        if (databases) {

            setShowButton(true);
            setDBInputValue(databases[0].id);
            setCompanyName(formattedSiteName)
            setInsightDB(databases[0].id);
        }
    }, [databases]);

    const {
        data: databaseMetadata,
        isLoading: databaseMetadataIsLoading,
        error: databaseMetadataIsError
    } = useGetDatabaseMetadataWithoutParamsQuery(
        dbInputValue !== "" ? { id: dbInputValue } : skipToken
    );
    const databaseMetadataData = databaseMetadata;
    useEffect(() => {
        if (databaseMetadataData) {
            const schema = databaseMetadata.tables.map((table) => ({
                display_name: table.display_name,
                id: table.id,
                fields: table.fields.map((field) => ({
                    id: field.id,
                    name: field.name,
                    fieldName: field.display_name,
                    description: field.description,
                    details: field.fingerprint ? JSON.stringify(field.fingerprint) : null
                }))
            }));
            setSchema(schema)
        }
    }, [databaseMetadataData]);

    // Initialize Client and Thread only once when component mounts
    useEffect(() => {
        const initializeClientAndThread = async () => {
            try {
                // Search for assistants
                const assistants = await client.assistants.search({ metadata: null, limit: 10, offset: 0 });
                let selectedAgent;

                if (chatType === 'insights') {
                    selectedAgent = assistants.find(assistant => assistant.assistant_id === '56788b8b-f7bf-415b-9bd9-1e89ac43f957');
                } else {
                    selectedAgent = assistants.find(assistant => assistant.assistant_id === '84d6bab8-80df-4e80-aeca-aea14081fc52');
                }

                // Fallback to first assistant if none match
                if (!selectedAgent) {
                    selectedAgent = assistants[0];
                }


                setAgent(selectedAgent);

                // Create a new thread
                if (!threadId) {
                    const createdThread = await client.threads.create();
                    setThread(createdThread); // Set the thread ID
                    setThreadId(createdThread); // Set it in parent state too
                } else {
                    setThread(threadId)
                    setInputValue("");
                }
            } catch (error) {
                console.error("Error initializing Client or creating thread:", error.message);
            } finally {
                setLoading(false); // Set loading to false after thread is created
            }
        };

        if (client) {
            initializeClientAndThread();
        }
    }, [client, chatType, threadId]);

    useEffect(() => {
        setMessages([])
        setInputValue("")
    }, [])

    const newChat = async () => {
        try {
            if (!client) return; // Ensure the client is initialized

            // Create a new thread using the client instance
            const createdThread = await client.threads.create();

            // Set the new thread ID in the state
            setSelectedThreadId(null);
            setThread(createdThread);
            setThreadId(createdThread)
            // Reset other relevant states for a fresh chat
            setMessages([]);
            setInputValue("");

            // Optionally, reset any other state such as chat history or old card ID if needed
        } catch (error) {
            console.error("Error creating new chat thread:", error);
        }
    }

    useEffect(() => {
        if (client && selectedMessages && selectedThreadId && selectedMessages.length > 0) {
            // Clear existing messages
            setMessages([]);
            setThreadId(selectedThreadId);

            const processMessages = async () => {
                let newMessages = [];
                let visualizationIdx = 0;

                // Loop through each selected message
                for (let i = 0; i < selectedMessages.length; i++) {
                    const message = selectedMessages[i];
                    const senderType = message.type === "human" ? "user" : "server";

                    // Attempt to parse JSON content if message is from AI or contains tool data
                    let card_id = null;
                    try {
                        if (typeof message.content === "string") {
                            const parsedContent = JSON.parse(message.content);
                            card_id = parsedContent.card_id || null;
                        } else if (Array.isArray(message.content)) {
                            message.content.forEach((contentPart) => {
                                if (contentPart.partial_json) {
                                    const parsedToolData = JSON.parse(contentPart.partial_json);
                                    if (parsedToolData.card_data && parsedToolData.card_data.dataset_query) {
                                        card_id = parsedToolData.card_data.dataset_query.query.card_id || null;
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        // If parsing fails, move on to add message normally
                    }

                    // Handle visualization if `card_id` is present
                    if (card_id) {
                        // Fetch data for this card
                        await handleGetDatasetQuery(card_id);

                        // Create a message specifically for the visualization
                        const visualizationMessage = {
                            id: Date.now() + Math.random(),
                            sender: "server",
                            text: "", // No text, as this is for visualization only
                            showVisualization: true,
                            visualizationIdx: visualizationIdx++,
                            isLoading: false,
                        };

                        newMessages.push(visualizationMessage);
                        continue; // Skip to next message since `card_id` messages don’t need text
                    }

                    // Standard message structure for non-card messages
                    const newMessageObj = {
                        id: generateRandomId(),
                        text: message.content,
                        typeMessage: "data",
                        sender: senderType,
                        type: "text",
                        isLoading: false,
                        thread_id: selectedThreadId,
                    };

                    // Add the regular message to the list
                    newMessages.push(newMessageObj);
                }

                // Update the messages state with the processed messages
                setMessages((prev) => [...prev, ...newMessages]);
            };

            processMessages();
        }
    }, [client, selectedMessages, selectedThreadId]);


    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = "100px";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
        if (inputRef.current) {
            inputRef.current.style.height = "100px";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    };

    const openModal = (cardData, isReportCard) => {
        if (isReportCard) {
            const route = `/question/${cardData.id}`;
            window.open(route, "_blank"); // Opens the route in a new tab
        } else {
            const route = `/question/${cardData.hash}`;
            window.open(route, "_blank"); // Opens the route in a new tab
        }
    };

    const closeModal = () => {
        setSelectedIndex(null)
        setIsModalOpen(false);
    };


    const handleGetDatasetQuery = async (cardId) => {
        try {
            setIsLoading(true); // Show loading state

            // Fetch the card details using the provided cardId
            const fetchedCard = await ChatCardApi.get({ cardId });
            const queryCard = await ChatCardApi.query({ cardId });
            const getDatasetQuery = fetchedCard?.dataset_query;

            if (!getDatasetQuery) {
                throw new Error("No dataset query found for this card.");
            }
            
            // Create a new question object based on the fetched card's dataset query
            const newQuestion = Question.create({
                databaseId: getDatasetQuery.database,
                name: fetchedCard.name,
                type: fetchedCard.query_type,
                display: fetchedCard.display,
                visualization_settings: {},
                dataset_query: getDatasetQuery,
            });

            // Generate a unique hash for this question
            let itemToHash;
            if (fetchedCard.query_type === "query") {
            itemToHash = {
                dataset_query: {
                    database: getDatasetQuery.database,
                    type: getDatasetQuery.type,
                    query: getDatasetQuery.query
                },

                display: fetchedCard.display,
                visualization_settings: {},
                type: "question",
            };
        } else {
            itemToHash = {
                dataset_query: {
                    database: getDatasetQuery.database,
                    type: getDatasetQuery.type,
                    native: getDatasetQuery.native
                },

                display: fetchedCard.display,
                visualization_settings: {},
                type: "question",
            };
        }
            const hash = adhocQuestionHash(itemToHash);
            // Append new values safely by ensuring prevCard is always an array
            setCard((prevCard) => Array.isArray(prevCard) ? [...prevCard, { ...fetchedCard, hash, typeQuery: getDatasetQuery.type }] : [{ ...fetchedCard, hash, typeQuery: getDatasetQuery.type }]);
            setDefaultQuestion((prevDefaultQuestion) => Array.isArray(prevDefaultQuestion) ? [...prevDefaultQuestion, newQuestion] : [newQuestion]);
            setResult((prevResult) => Array.isArray(prevResult) ? [...prevResult, queryCard] : [queryCard]);
            setCardHash((prevCardHash) => Array.isArray(prevCardHash) ? [...prevCardHash, hash] : [hash]);

            // Handle code query if needed
            setCodeQuery((prevCodeQuery) => {
                const query = queryCard?.data?.native_form?.query ?? "Sorry, query was not retrieved properly.";
                return Array.isArray(prevCodeQuery) ? [...prevCodeQuery, query] : [query];
            });

        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true);
            setError("There was an error fetching the dataset. Please provide feedback if this issue persists.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (pendingInfoMessage && visualizationIndex >= 0) {
            setMessages(prevMessages => {
                const newMessage = {
                    id: Date.now() + Math.random(),
                    text: pendingInfoMessage,
                    sender: "server",
                    type: "text",
                    info: true,
                    isInsightData: false,
                    isInsightError: true,
                    typeMessage: "error",
                };

                return [...prevMessages, newMessage];
            });

            setPendingInfoMessage(null);
        }
    }, [pendingInfoMessage, visualizationIndex, setMessages]);

    const redirect = async () => {
        if (selectedHash) {
            dispatch(push(`/question#${selectedHash}`));
            // const deletedCard = await ChatCardApi.delete({ id: id });
        }
    }

    const sendMessage = async (messageContent) => {
        const content = messageContent || inputValue;
        if (!content.trim() || !client || !agent || !thread) return;

        setIsLoading(true);  // Set loading to true when the message is sent
        let visualizationIdx = messages.filter((msg) => msg.showVisualization).length;

        // Prepare the user message to be sent
        let messagesToSend = [{ role: "human", content }];
        const userMessage = {
            id: Date.now() + Math.random(),
            sender: "user",
            text: content,
            visualizationIdx,
            showVisualization: false,
            isLoading: true,
            showFeedback: false,
        };
        setInputValue("");
        // Display temporary message during server response wait time
        const tempMessageId = Date.now() + Math.random();
        let tempMessage;

        if (chatType !== 'insights') {
            tempMessage = {
                id: tempMessageId,
                sender: "server",
                text: "", // This will be updated with the actual content from the response chunks
                isLoading: true
            };

            // Append the user message and the temporary server message to the state
            setMessages((prev) => [...prev, userMessage, tempMessage]);

            // Call emulateDataStream to show a waiting message while we fetch the first chunk
            emulateDataStream(50, tempMessageId);
        } else {
            tempMessage = {
                id: Date.now() + Math.random(),
                text: t`Please wait until we generate the response....`,
                typeMessage: "data",
                sender: "server",
                type: "text",
                isLoading: true,
            };
            setMessages((prev) => [...prev, userMessage, tempMessage]);
        }

        // Clear the input field

        setChatDisabled(true);
        setChatLoading(true);
        let currentMessage = ""; // To accumulate partial chunks
        let isNewMessage = true; // Flag to track new message status
        let lastMessageId = tempMessageId; // Track last message to update its loading state
        let cardGenerated = false; // Track if the card has been generated
        let finalMessageProcessed = false; // Track if the final message has been appended
        let placeholderRemoved = false;

        try {
            const schema = chatType === 'insights' ? initialInsightSchema : initialSchema.schema;
            const databaseID = chatType === 'insights' ? initialInsightDbName : initialDbName;

            const streamResponse = client.runs.stream(thread.thread_id, agent.assistant_id, {
                input: { messages: messagesToSend, company_name: initialCompanyName, database_id: databaseID, schema: modelSchema, session_token: metabase_id_back, collection_id: 2 },
                config: { recursion_limit: 25 },
                streamMode: "messages",
            });
            for await (const chunk of streamResponse) {
                const { event, data } = chunk;
                if (event === "messages/partial" && data.length > 0) {
                    const messageData = data[0];
                    const { content, type, tool_calls, response_metadata, id } = messageData;
                    let partialText = "";
                    if (typeof content === "string") {
                        partialText = content; // If it's a simple string
                    } else if (Array.isArray(content) && content.length > 0 && content[0].text) {
                        partialText = content[0].text; // Extract text from the first object in the array
                    }
                    if (partialText.startsWith("\n")) {
                        partialText = partialText.replace(/^\n+/, ""); // Remove any leading newlines
                    }

                    setRunId(id)
                    if (!placeholderRemoved && partialText.trim() !== "") {
                        const placeholderMessages = [
                            t`Scanning through your card collection and analyzing relevant tables...`,
                            t`Identifying patterns in the data and cross-referencing cards with table structures...`,
                            t`Exploring relationships between request and cards and extracting key metrics from tables...`,
                            t`Mapping relevant cards and corresponding table columns for comprehensive analysis...`,
                            t`Evaluating the semantic connections between cards and their associated table data...`
                        ];
                        setMessages((prevMessages) =>
                            prevMessages.filter(
                                (msg) => !placeholderMessages.includes(msg.text)
                            )
                        );
                        placeholderRemoved = true;
                    }
                    if (messageData && partialText) {

                        // Check if the current chunk contains the previous message or it's a new message
                        if (chatType !== 'insights') {
                            if (isNewMessage || !partialText.startsWith(currentMessage)) {
                                // New message stream detected, append a new temporary message
                                const newTempMessageId = Date.now() + Math.random();
                                const newTempMessage = {
                                    id: newTempMessageId,
                                    sender: "server",
                                    text: partialText, // Use partial chunk text
                                    isLoading: true,
                                    isTemporary: true,
                                };
                                setMessages((prev) => [...prev, newTempMessage]);

                                // Set flag to false after first chunk of the new message
                                isNewMessage = false;
                                lastMessageId = newTempMessageId;  // Track the new message ID
                            } else {
                                // Replace the last message with the new chunk if it's a continuation
                                setMessages((prev) => {
                                    const updatedMessages = [...prev];
                                    const lastMessageIndex = updatedMessages.findIndex(msg => msg.id === lastMessageId);

                                    // Replace text of the last message with the new partial content
                                    if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isTemporary) {
                                        updatedMessages[lastMessageIndex].text = partialText; // Replace with the full message
                                    }
                                    return updatedMessages;
                                });
                            }
                        } else {
                            setFinalMessages((prevText) => {
                                const updatedText = [...prevText];
                                const lastMessage = updatedText[updatedText.length - 1];
                                if (lastMessage && lastMessage.sender === 'server') {
                                    // Update the text of the last message if it's from the server
                                    updatedText[updatedText.length - 1].text = typeof content === 'string' ? content : JSON.stringify(content);
                                } else {
                                    // Add a new message from the server if the last one wasn't from the server
                                    updatedText.push({
                                        id: Date.now() + Math.random(),
                                        sender: "server",
                                        text: typeof content === 'string' ? content : JSON.stringify(content),
                                    });
                                }
                                return updatedText;
                            });
                        }

                        // Store the current message to ensure the final text is updated correctly
                        currentMessage = partialText;
                    }

                    // Handle tool calls (like card generation)
                    if (tool_calls.length > 0 && response_metadata && response_metadata.finish_reason === 'stop') {
                        if (tool_calls[0].name === "IdentifyFieldsOutput") {
                            const { table_names } = tool_calls[0].args;
                        } else if (tool_calls[0].name === "CreatePlanOutput") {
                            const { steps } = tool_calls[0].args;
                            removeExistingMessage(t`Please wait until we generate the response....`);
                            setMessages(prevMessages => [
                                ...prevMessages,
                                {
                                    id: Date.now() + Math.random(),
                                    text: t`Here is a plan on how we want to get insights for your task.`,
                                    typeMessage: "data",
                                    sender: "server",
                                    showType: "insightProgress",
                                }
                            ]);
                            setInisghtPlan(steps);
                            setProgressShow(true);
                        } else if (tool_calls[0].name === "GenerateCardOutput") {
                            const { card_id } = tool_calls[0].args;

                            await handleGetDatasetQuery(card_id);

                            setMessages((prev) => {
                                const visualizationMessage = {
                                    id: Date.now() + Math.random(),
                                    sender: "server",
                                    text: "", // Visualizations typically don’t have text
                                    showVisualization: true,
                                    visualizationIdx: visualizationIdx++,
                                    isLoading: false,
                                };

                                return [...prev, visualizationMessage]; // Append visualization message without removing others
                            });

                            cardGenerated = true;
                        }
                    }
                }

                // Handle complete messages
                if (event === "messages/complete" && data.length > 0) {
                    setFinalMessages((prevFinalMessages) => {
                        const lastMessage = prevFinalMessages[prevFinalMessages.length - 1]?.text || '';
                        // Use the last message (chunk) to update finalMessagesText
                        const lastChunk = lastMessage;
                        // Update finalMessagesText after processing
                        setFinalMessagesText((prevFinalMessagesText) => [
                            ...prevFinalMessagesText,
                            lastChunk,
                        ]);

                        return prevFinalMessages;
                    });
                    const messageData = data[0];

                    // Handle tool type messages
                    if (messageData && messageData.type === "tool") {
                        try {
                            const parsedContent = JSON.parse(messageData.content);
                            const { card_id, explanation, python_code, result } = parsedContent;

                            if (card_id) {
                                // const cardMessageId = Date.now() + Math.random();
                                // const cardTempMessage = {
                                //     id: cardMessageId,
                                //     sender: "server",
                                //     text: t`Generating card...`, // Show progress text
                                //     isLoading: true,
                                //     isTemporary: true,
                                // };

                                // // Append the card generation message
                                // setMessages((prev) => [...prev, cardTempMessage]);

                                // Fetch the dataset and append the card
                                await handleGetDatasetQuery(card_id);

                                setMessages((prev) => {
                                    const visualizationMessage = {
                                        id: Date.now() + Math.random(),
                                        sender: "server",
                                        text: "", // Visualizations typically don’t have text
                                        showVisualization: true,
                                        visualizationIdx: visualizationIdx++,
                                        isLoading: false,
                                    };

                                    return [...prev, visualizationMessage];
                                });

                                cardGenerated = true;
                            }

                            if (python_code && explanation) {
                                removeExistingMessage(t`Please wait until we generate the response....`)
                                setInsightCellCode((prevCode) => [...prevCode, python_code]);
                                setInsightsText((prevText) => [...prevText, explanation]);
                                setInsightsCode((prevCode) => [...prevCode, python_code]);
                            }

                            if (result && result.outputs && result.outputs.length > 0) {
                                removeExistingMessage(t`Please wait until we generate the response....`)
                                result.outputs.forEach((output) => {
                                    if (output.data && output.data['image/png']) {
                                        const generatedImages = output.data['image/png'];
                                        const base64Image = `data:image/png;base64,${generatedImages}`;
                                        setInsightsImg((prevInsightsImg) => [...prevInsightsImg, base64Image]);
                                    }
                                    if (output.data && output.data['text/plain']) {
                                        const plainText = output.data['text/plain'];
                                        if (!plainText.includes('<Figure size') && !plainText.includes('Axes>')) {
                                            setFinalMessagesText((prevText) => [...prevText, plainText]);
                                        }
                                    }
                                });
                            }
                        } catch (error) {
                            console.error("Error parsing tool message content:", error);
                        }
                    } else if (messageData && typeof messageData.content === 'string' && !finalMessageProcessed && !inputValue === messageData.content) {
                        // Avoid duplication by ensuring the final message is only appended once
                        finalMessageProcessed = true;

                        setMessages((prev) => [
                            ...prev,
                            {
                                id: Date.now() + Math.random(),
                                sender: "server",
                                text: messageData.content, // Complete message content
                                isLoading: false,
                                showVisualization: false,
                                completedAfterCard: cardGenerated, // Flag to show it came after card generation
                            },
                        ]);

                        // Reset the state for the next message
                        currentMessage = "";
                        isNewMessage = true;
                    }
                }



                if (event === "error" && data) {
                    if (data.error === "UserInterrupt") {
                        console.log(data.message)
                    } else {
                        removeExistingMessage(t`Please wait until we generate the response....`)
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: Date.now() + Math.random(),
                                sender: "server",
                                text: t`There was an error processing your request. Please contact team Omniloy for assistance.`,
                                typeMessage: 'error',
                                isLoading: false,
                                showVisualization: false,
                                showSuggestionButton: false
                            },
                        ])
                    }
                }


            }
            const list = await client.runs.list(thread.thread_id);
            if (list && list.length > 0 && thread.thread_id) {
                setRunId(list[0].run_id)
                const streamStatus = await client.runs.get(thread.thread_id, list[0].run_id);
                if (streamStatus && streamStatus.status !== 'pending') {
                    setChatDisabled(false);
                    setChatLoading(false);
                }
            }
            setChatDisabled(false);
            setChatLoading(false);
            setIsLoading(false);
        } catch (error) {
            setChatDisabled(false);
            setChatLoading(false);
            console.error("Error during message processing:", error.message);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + Math.random(),
                    sender: "server",
                    text: t`An error occurred while processing your request. Please try again later.`,
                    isLoading: false,
                    showVisualization: false
                },
                {
                    id: Date.now() + Math.random(),
                    sender: "server",
                    text: error.message,
                    isLoading: false,
                    showVisualization: false
                },
            ]);
        } finally {
            setChatDisabled(false);
            setChatLoading(false);
            setShouldRefetchHistory(true);
            setMessages((prev) =>
                prev.map((msg, index) =>
                    index === prev.length - 1
                        ? { ...msg, isLoading: false, showFeedback: true }
                        : msg
                )
            );
            setIsLoading(false);
            setIsFeedbackVisible(true);
        }
    };

    const removeRunPrefix = (str) => {
        return str.startsWith("run-") ? str.replace("run-", "") : str;
    }

    const handleSendFeedback = async (score, messageId, correctionText) => {
        try {
            if (score === 1) {
                await clientSmith.createFeedback(removeRunPrefix(runId), "user-score", { score: score });
            } else {
                await clientSmith.createFeedback(removeRunPrefix(runId), "comment", { comment: correctionText });
            }

        } catch (error) {
            console.error("Error sending feedback:", error);
        } finally {
            toast.success('Feedback submitted!')
        }
    };

    // Updated emulateDataStream to integrate with chat messages
    function emulateDataStream(chunkInterval = 50, tempMessageId) {
        const messages = [
            t`Scanning through your card collection and analyzing relevant tables...`,
            t`Identifying patterns in the data and cross-referencing cards with table structures...`,
            t`Exploring relationships between request and cards and extracting key metrics from tables...`,
            t`Mapping relevant cards and corresponding table columns for comprehensive analysis...`,
            t`Evaluating the semantic connections between cards and their associated table data...`
        ];
        const startTime = Date.now();

        function chunkString(str, chunkSize) {
            const chunks = [];
            for (let i = 0; i < str.length; i += chunkSize) {
                chunks.push(str.slice(i, i + chunkSize));
            }
            return chunks;
        }

        function getRandomMessage() {
            return messages[Math.floor(Math.random() * messages.length)];
        }

        function simulateTyping(message, index = 0) {
            const chunks = chunkString(message, 5); // Chunk size of 5 characters

            if (index < chunks.length) {
                setMessages((prev) => {
                    return prev.map((msg) =>
                        msg.id === tempMessageId
                            ? {
                                ...msg,
                                text: msg.text + chunks[index], // Append chunks of text
                            }
                            : msg
                    );
                });
                setTimeout(() => simulateTyping(message, index + 1), chunkInterval);
            }
        }

        const selectedMessage = getRandomMessage();
        simulateTyping(selectedMessage);
    }


    const handleSuggestion = () => {
        // setMessages(prevMessages => [
        //     ...prevMessages,
        //     {
        //         id: Date.now() + Math.random(),
        //         text: suggestionQuestion,
        //         typeMessage: "data",
        //         sender: "user",
        //         type: "text",
        //         // thread_id: threadId,
        //     }
        // ]);
        // const response = {
        //     type: "query",
        //     task: suggestionQuestion,
        //     thread_id: threadId,
        //     appType: chatType,
        // };
        // ws && ws.send(JSON.stringify(response));
    }
    const removeLoadingMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => message.text !== t`Please wait until we generate the response....` && message.text !== t`Please wait until we generate the visualization for you....`
        ));
    };

    const removeExistingMessage = (messageContent) => {
        setMessages(prevMessages =>
            prevMessages.filter(message => message.text !== messageContent)
        );
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // Prevent the default behavior of creating a new line
            sendMessage();
        }
    };

    const handleFeedbackDialogOpen = () => {
        setIsModalOpen(false);
        setIsFeedbackDialogOpen(!isFeedbackDialogOpen);
    };

    const handleCubeRequestDialogOpen = () => {
        setIsCbubeRequestDialogOpen(!isCubeRequestDialogOpen);
    };

    const handleAccept = () => {
        // ws.send(
        //     JSON.stringify({
        //         type: "toolResponse",
        //         response: {
        //             function_name: toolWaitingResponse,
        //             response: "true",
        //         },
        //     })
        // );
        // setApprovalChangeButtons(false);
    };

    const handleDeny = () => {
        // ws.send(
        //     JSON.stringify({
        //         type: "toolResponse",
        //         response: {
        //             function_name: toolWaitingResponse,
        //             response: "false",
        //         },
        //     })
        // );
        // setApprovalChangeButtons(false);
    };

    const stopStream = async (runId) => {
        setChatLoading(false);
        setChatDisabled(false);
        client.runs.cancel(thread.thread_id, runId);
    };

    const stopMessage = async () => {
        setManualCancel(true)
        setMessages((prev) => {
            const manualCancel = {
                id: Date.now() + Math.random(),
                sender: "server",
                text: "",
                showVisualization: false,
                isLoading: false,
                manualCancel: true
            };

            return [...prev, manualCancel];
        });
        const list = await client.runs.list(thread.thread_id);
        if (list && list.length > 0 && thread.thread_id) {
            setRunId(list[0].run_id)
            await stopStream(list[0].run_id);
        }
    }

    useEffect(() => {
        if (initial_message.message && client && agent && thread) {
            sendMessage(initial_message.message);
            dispatch(setInitialMessage(""));  // Clear initial message after sending to avoid re-triggering
        }
    }, [initial_message.message, client, agent, thread]);


    useEffect(() => {
        if (initialDbName !== null && initialCompanyName !== '' && initialSchema && initialSchema.schema && initialSchema.schema.length > 0) {
            setShowButton(true);
            setDBInputValue(initialDbName)
            setCompanyName(initialCompanyName)
            setSchema(initialSchema.schema)
        }
    }, [initialDbName, initialCompanyName, initialSchema])


    return (
        <>
            <Box
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "85vh",
                    width: "100%",
                }}
            >
                {loading ? (
                    <></>
                ) : (

                    <>
                        <Button
                            variant="outlined"
                            style={{
                                position: "absolute",
                                top: "16px",
                                right: "16px",
                                cursor: "pointer",
                                padding: "8px",
                                color: "#FFF",
                                borderRadius: "50%",
                            }}
                            onClick={() => setIsDBModalOpen(true)}
                        >
                        </Button>
                        <div
                            style={{
                                flex: "1 1 auto",
                                overflowY: "auto",
                                padding: "16px",
                                borderRadius: "12px",
                                marginBottom: "150px", // Adjust this value based on the input area height
                            }}
                        >

                            <ChatMessageList messages={messages} isLoading={isLoading} onFeedbackClick={handleFeedbackDialogOpen} isFeedbackVisible={isFeedbackVisible}
                                approvalChangeButtons={approvalChangeButtons} onApproveClick={handleAccept} onDenyClick={handleDeny}
                                card={card} defaultQuestion={defaultQuestion} result={result} openModal={openModal} redirect={redirect}
                                showError={showError} insightsCode={insightsCode} showCubeEditButton={showCubeEditButton} sendAdminRequest={handleCubeRequestDialogOpen} onSuggestion={handleSuggestion}
                                insightCellCode={insightCellCode} insightsImg={insightsImg} insightsPlan={inisghtPlan} progressShow={progressShow}
                                insightsText={insightsText} finalMessages={finalMessages} finalMessagesText={finalMessagesText} onSendFeedback={handleSendFeedback}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center", // Center horizontally
                                    width: "100%",            // Take full width
                                    maxWidth: `calc(100% - ${isChatHistoryOpen ? "800px" : "500px"})`, // Adjust the width based on the chat history visibility
                                    backgroundColor: "#FFF",
                                    position: "fixed",
                                    bottom: "5rem"
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        width: "100%",
                                        height: `${selectedThreadId ? "70px" : ""}`,
                                        padding: "8px",
                                        border: "1px solid #E0E0E0",
                                        borderRadius: "8px",
                                        backgroundColor: "#F8FAFD",
                                        position: "relative", // Important for absolute positioning inside this div
                                    }}
                                >
                                    {!selectedThreadId ? (
                                        <>
                                            <TextArea
                                                ref={inputRef}
                                                value={inputValue}
                                                onChange={handleInputChange}
                                                onKeyPress={(e) => {
                                                    if (
                                                        e.key === "Enter" &&
                                                        !e.shiftKey &&
                                                        client &&
                                                        !chatLoading &&
                                                        schema.length > 0 &&
                                                        !selectedThreadId &&
                                                        !chatDisabled
                                                    ) {
                                                        e.preventDefault();
                                                        sendMessage();
                                                    }
                                                }}
                                                placeholder={t`Enter a prompt here...`}
                                                style={{
                                                    width: "100%",
                                                    resize: "none",
                                                    overflowY: "auto",
                                                    height: "100px",
                                                    minHeight: "100px",
                                                    maxHeight: "220px",
                                                    padding: "12px",
                                                    paddingRight: "50px",
                                                    lineHeight: "24px",
                                                    border: "none",
                                                    outline: "none",
                                                    boxSizing: "border-box",
                                                    borderRadius: "8px",
                                                    backgroundColor: "transparent",
                                                }}
                                            />

                                            <Button
                                                variant="filled"
                                                onClick={() => {
                                                    if (client && schema.length > 0 && !chatLoading && !selectedThreadId && !chatDisabled) {
                                                        sendMessage();
                                                    } else {
                                                        stopMessage();
                                                    }
                                                }}
                                                style={{
                                                    position: "absolute",
                                                    right: "10px",
                                                    bottom: "10px",
                                                    borderRadius: "8px",
                                                    width: "30px",
                                                    height: "30px",
                                                    padding: "0",
                                                    minWidth: "0",
                                                    backgroundColor: "#8A64DF",
                                                    color: "#FFF",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                }}
                                            >
                                                {client && schema.length > 0 && !chatLoading && !selectedThreadId && !chatDisabled ? (
                                                    <Icon size={18} name="sendChat" style={{ paddingTop: "2px", paddingLeft: "2px" }} />
                                                ) : (
                                                    <Icon size={18} name="stop" style={{ paddingTop: "2px" }} />
                                                )}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="filled"
                                            disabled={!client}
                                            onClick={newChat}
                                            style={{
                                                position: "absolute",
                                                right: "10px",
                                                bottom: "10px",
                                                borderRadius: "8px",
                                                width: "200px",
                                                height: "50px",
                                                padding: "0",
                                                minWidth: "0",
                                                backgroundColor: client ? "#8A64DF" : "#F1EBFF",
                                                color: "#FFF",
                                                border: "none",
                                                cursor: client ? "pointer" : "not-allowed",
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                            }}
                                        >
                                            Generate new chat
                                        </Button>
                                    )}

                                </div>
                            </div>


                        </div>
                    </>

                )}

            </Box>

            {isDBModalOpen && (
                <Modal isOpen={isDBModalOpen} onClose={() => setIsDBModalOpen(false)}>
                    <div style={{ padding: "20px" }}>
                        <h2 style={{ marginBottom: "10px" }}>Enter DB Value</h2>
                        <Input
                            id="dbInput"
                            type="text"
                            value={dbInputValue}
                            onChange={(e) => setDBInputValue(e.target.value)}
                            style={{ marginBottom: "20px" }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Button variant="outlined" style={{ marginRight: "10px" }} onClick={() => setIsDBModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="filled" onClick={() => setIsDBModalOpen(false)}>
                                Save
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            <FeedbackDialog
                isOpen={isFeedbackDialogOpen}
                onClose={handleFeedbackDialogOpen}
                messages={messages}

            />
            <CubeRequestDialog
                isOpen={isCubeRequestDialogOpen}
                onClose={handleCubeRequestDialogOpen}
                messages={messages}
                requestedFields={requestedFields}

            />
        </>
    );
};

export default ChatAssistant;
