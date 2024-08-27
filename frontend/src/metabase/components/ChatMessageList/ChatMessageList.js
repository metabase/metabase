import Message from "./Message";

const ChatMessageList = ({ messages, isLoading, onFeedbackClick, approvalChangeButtons, onApproveClick, onDenyClick }) => {
  return (
    <div
      style={{
        flexGrow: 1,
        padding: "16px",
        borderRadius: "12px 12px 0 0",
        overflowY: "auto",
      }}
    >
      {messages.map((message, index) => (
        <Message
          key={message.id || index}
          message={message}
          isLoading={
            isLoading &&
            message.sender === "server" &&
            message.text === "Please wait until we generate the response...."
          }
          onFeedbackClick={onFeedbackClick} // Pass the callback to each Message
          approvalChangeButtons={
            approvalChangeButtons &&
            message.sender === "server" &&
            message.text.startsWith("New fields")}
          onApproveClick={onApproveClick}
          onDenyClick={onDenyClick}
        />
      ))}
    </div>
  );
};

export default ChatMessageList;
