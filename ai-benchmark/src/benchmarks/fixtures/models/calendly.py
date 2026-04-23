import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class EventType(Base):
    __tablename__ = "event_type"
    __table_args__ = (
        PrimaryKeyConstraint("uri", name="event_type_pkey"),
        Index("idx_event_type_active", "active"),
        Index("idx_event_type_kind", "kind"),
        Index("idx_event_type_slug", "slug"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    slug: Mapped[str | None] = mapped_column(String(100))
    kind: Mapped[str | None] = mapped_column(String(50))
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    scheduling_url: Mapped[str | None] = mapped_column(Text)
    description_plain: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(20))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event: Mapped[list["Event"]] = relationship("Event", back_populates="event_type")
    routing_form_submission: Mapped[list["RoutingFormSubmission"]] = relationship(
        "RoutingFormSubmission", back_populates="event_type"
    )


class Organization(Base):
    __tablename__ = "organization"
    __table_args__ = (PrimaryKeyConstraint("uri", name="organization_pkey"), {"schema": "calendly_data"})

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class RoutingForm(Base):
    __tablename__ = "routing_form"
    __table_args__ = (
        PrimaryKeyConstraint("uri", name="routing_form_pkey"),
        Index("idx_routing_form_status", "status"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    routing_form_submission: Mapped[list["RoutingFormSubmission"]] = relationship(
        "RoutingFormSubmission", back_populates="routing_form"
    )


class User(Base):
    __tablename__ = "user"
    __table_args__ = (
        PrimaryKeyConstraint("uri", name="user_pkey"),
        Index("idx_user_email", "email"),
        Index("idx_user_slug", "slug"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    slug: Mapped[str | None] = mapped_column(String(100))
    scheduling_url: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event_membership: Mapped[list["EventMembership"]] = relationship("EventMembership", back_populates="user")


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscription"
    __table_args__ = (
        PrimaryKeyConstraint("uri", name="webhook_subscription_pkey"),
        Index("idx_webhook_scope", "scope"),
        Index("idx_webhook_state", "state"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    callback_url: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    state: Mapped[str | None] = mapped_column(String(50))
    scope: Mapped[str | None] = mapped_column(String(50))
    signing_key: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Event(Base):
    __tablename__ = "event"
    __table_args__ = (
        ForeignKeyConstraint(["event_type_uri"], ["calendly_data.event_type.uri"], name="event_event_type_uri_fkey"),
        PrimaryKeyConstraint("uri", name="event_pkey"),
        Index("idx_event_canceled", "canceled_at"),
        Index("idx_event_event_type", "event_type_uri"),
        Index("idx_event_start_time", "start_time"),
        Index("idx_event_status", "status"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    event_type_uri: Mapped[str | None] = mapped_column(String(255))
    location_type: Mapped[str | None] = mapped_column(String(50))
    location_value: Mapped[str | None] = mapped_column(Text)
    canceled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event_type: Mapped[Optional["EventType"]] = relationship("EventType", back_populates="event")
    event_membership: Mapped[list["EventMembership"]] = relationship("EventMembership", back_populates="event")
    invitee: Mapped[list["Invitee"]] = relationship("Invitee", back_populates="event")


class RoutingFormSubmission(Base):
    __tablename__ = "routing_form_submission"
    __table_args__ = (
        ForeignKeyConstraint(
            ["result_event_type_uri"],
            ["calendly_data.event_type.uri"],
            name="routing_form_submission_result_event_type_uri_fkey",
        ),
        ForeignKeyConstraint(
            ["routing_form_uri"],
            ["calendly_data.routing_form.uri"],
            name="routing_form_submission_routing_form_uri_fkey",
        ),
        PrimaryKeyConstraint("uri", name="routing_form_submission_pkey"),
        Index("idx_form_submission_created", "created_at"),
        Index("idx_form_submission_email", "submitter_email"),
        Index("idx_form_submission_form", "routing_form_uri"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    routing_form_uri: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    submitter_email: Mapped[str | None] = mapped_column(String(255))
    result_event_type_uri: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event_type: Mapped[Optional["EventType"]] = relationship("EventType", back_populates="routing_form_submission")
    routing_form: Mapped["RoutingForm"] = relationship("RoutingForm", back_populates="routing_form_submission")


class EventMembership(Base):
    __tablename__ = "event_membership"
    __table_args__ = (
        ForeignKeyConstraint(["event_uri"], ["calendly_data.event.uri"], name="event_membership_event_uri_fkey"),
        ForeignKeyConstraint(["user_uri"], ["calendly_data.user.uri"], name="event_membership_user_uri_fkey"),
        PrimaryKeyConstraint("event_uri", "user_uri", name="event_membership_pkey"),
        Index("idx_event_membership_event", "event_uri"),
        Index("idx_event_membership_user", "user_uri"),
        {"schema": "calendly_data"},
    )

    event_uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event: Mapped["Event"] = relationship("Event", back_populates="event_membership")
    user: Mapped["User"] = relationship("User", back_populates="event_membership")


class Invitee(Base):
    __tablename__ = "invitee"
    __table_args__ = (
        ForeignKeyConstraint(["event_uri"], ["calendly_data.event.uri"], name="invitee_event_uri_fkey"),
        PrimaryKeyConstraint("uri", name="invitee_pkey"),
        Index("idx_invitee_canceled", "canceled"),
        Index("idx_invitee_email", "email"),
        Index("idx_invitee_event", "event_uri"),
        Index("idx_invitee_status", "status"),
        {"schema": "calendly_data"},
    )

    uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_uri: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    timezone: Mapped[str | None] = mapped_column(String(50))
    canceled: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    event: Mapped["Event"] = relationship("Event", back_populates="invitee")
    invitee_question_answer: Mapped[list["InviteeQuestionAnswer"]] = relationship(
        "InviteeQuestionAnswer", back_populates="invitee"
    )


class InviteeQuestionAnswer(Base):
    __tablename__ = "invitee_question_answer"
    __table_args__ = (
        ForeignKeyConstraint(
            ["invitee_uri"], ["calendly_data.invitee.uri"], name="invitee_question_answer_invitee_uri_fkey"
        ),
        PrimaryKeyConstraint("invitee_uri", "question", name="invitee_question_answer_pkey"),
        Index("idx_question_answer_invitee", "invitee_uri"),
        {"schema": "calendly_data"},
    )

    invitee_uri: Mapped[str] = mapped_column(String(255), primary_key=True)
    question: Mapped[str] = mapped_column(String(500), primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    invitee: Mapped["Invitee"] = relationship("Invitee", back_populates="invitee_question_answer")
