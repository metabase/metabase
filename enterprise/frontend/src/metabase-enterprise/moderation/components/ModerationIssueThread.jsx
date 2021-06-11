import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { useAsyncFunction } from "metabase/lib/hooks";

import Button from "metabase/components/Button";
import Comment from "metabase/components/Comment";
import ModerationIssueActionMenu from "metabase-enterprise/moderation/components/ModerationIssueActionMenu";
import ModerationIssuePill from "metabase-enterprise/moderation/components/ModerationIssuePill";

ModerationIssueThread.propTypes = {
  className: PropTypes.string,
  request: PropTypes.object.isRequired,
  comments: PropTypes.array,
  onComment: PropTypes.func,
  onModerate: PropTypes.func,
  onUpdateRequestText: PropTypes.func,
  onResolveOwnRequest: PropTypes.func,
};

const COMMMENT_VISIBLE_LINES = 3;

export function ModerationIssueThread({
  className,
  request,
  comments = [],
  onComment,
  onModerate,
  onUpdateRequestText,
  onResolveOwnRequest,
}) {
  const [showRequestTextForm, setShowRequestTextForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);

  const [safeOnComment, isCommentPending] = useAsyncFunction(onComment);
  const [safeOnUpdateRequestText, isRequestPending] = useAsyncFunction(
    onUpdateRequestText,
  );

  const hasRequestActions = !!(onUpdateRequestText || onResolveOwnRequest);
  const isEditingText = showCommentForm || showRequestTextForm;
  const hasButtonBarActions = !!(onComment || onModerate);
  const showButtonBar = !isEditingText && hasButtonBarActions;

  const closeAllForms = () => {
    setShowRequestTextForm(false);
    setShowCommentForm(false);
  };

  const onCommentSubmit = async comment => {
    try {
      await safeOnComment(comment, request);
    } catch (error) {
      console.error(error);
    } finally {
      setShowCommentForm(false);
    }
  };

  const onEditRequestSubmit = async text => {
    try {
      await safeOnUpdateRequestText(text, request);
    } catch (error) {
      console.error(error);
    } finally {
      setShowRequestTextForm(false);
    }
  };

  const requestActions =
    hasRequestActions &&
    [
      onUpdateRequestText && {
        icon: "pencil",
        title: t`Edit Text`,
        action: () => {
          closeAllForms();
          setShowRequestTextForm(true);
        },
      },
      onResolveOwnRequest && {
        icon: "close",
        title: t`Close Request`,
        action: () => {
          onResolveOwnRequest(request);
        },
      },
    ].filter(Boolean);

  return (
    <div className={className}>
      <ModerationIssuePill type={request.type} status={request.status} />
      {showRequestTextForm ? (
        <CommentForm
          onSubmit={onEditRequestSubmit}
          onCancel={() => setShowRequestTextForm(false)}
          isPending={isRequestPending}
          initialValue={request.text}
        />
      ) : (
        <Comment
          className="pt1"
          title={request.title}
          text={request.text}
          timestamp={request.timestamp}
          visibleLines={COMMMENT_VISIBLE_LINES}
          actions={requestActions}
        />
      )}
      {comments.map(comment => {
        return (
          <Comment
            className="pt2"
            key={comment.id}
            icon={comment.isModerator && "shield"}
            title={comment.title}
            text={comment.text}
            timestamp={comment.timestamp}
            visibleLines={COMMMENT_VISIBLE_LINES}
          />
        );
      })}
      {showCommentForm && (
        <CommentForm
          className="pt1"
          onSubmit={onCommentSubmit}
          onCancel={() => {
            closeAllForms();
            setShowCommentForm(false);
          }}
          isPending={isCommentPending}
        />
      )}
      {showButtonBar && (
        <div className="flex justify-end column-gap-1 pt1">
          {onComment && (
            <Button
              className="py1"
              onClick={() => setShowCommentForm(true)}
            >{t`Comment`}</Button>
          )}
          {onModerate && (
            <ModerationIssueActionMenu
              triggerClassName="text-white text-white-hover bg-brand bg-brand-hover py1"
              onAction={actionType => onModerate(actionType, request)}
              targetIssueType={request.type}
            />
          )}
        </div>
      )}
    </div>
  );
}

CommentForm.propTypes = {
  className: PropTypes.string,
  initialValue: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isPending: PropTypes.bool,
};

function CommentForm({
  className,
  initialValue = "",
  onSubmit,
  onCancel,
  isPending,
}) {
  const [value, setValue] = useState(initialValue);
  const isEmpty = value.trim().length === 0;

  return (
    <form
      className={className}
      onSubmit={e => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <textarea
        className="input full max-w-full min-w-full"
        value={value}
        onChange={e => setValue(e.target.value)}
        name="comment"
        autoFocus
      />
      <div className="pt1 flex column-gap-1 justify-end">
        <Button
          className="py1"
          disabled={isPending}
          type="button"
          onClick={onCancel}
        >
          {t`Cancel`}
        </Button>
        <Button
          className="py1"
          disabled={isPending || isEmpty}
          type="submit"
          primary
        >
          {t`Done`}
        </Button>
      </div>
    </form>
  );
}
