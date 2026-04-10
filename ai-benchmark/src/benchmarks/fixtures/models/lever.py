import datetime
from typing import Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ArchiveReason(Base):
    __tablename__ = "archive_reason"
    __table_args__ = (PrimaryKeyConstraint("id", name="archive_reason_pkey"), {"schema": "lever_data"})

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    text_: Mapped[str] = mapped_column("text", String(255), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Opportunity(Base):
    __tablename__ = "opportunity"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="opportunity_pkey"),
        Index("idx_opportunity_archived", "archived_at"),
        Index("idx_opportunity_created", "created_at"),
        Index("idx_opportunity_owner", "owner_id"),
        Index("idx_opportunity_stage", "stage_id"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    headline: Mapped[str | None] = mapped_column(String(500))
    contact: Mapped[str | None] = mapped_column(String(255))
    emails: Mapped[list[str] | None] = mapped_column(ARRAY(Text()))
    phones: Mapped[list[str] | None] = mapped_column(ARRAY(Text()))
    location: Mapped[str | None] = mapped_column(String(255))
    origin: Mapped[str | None] = mapped_column(String(100))
    owner_id: Mapped[str | None] = mapped_column(String(50))
    stage_id: Mapped[str | None] = mapped_column(String(50))
    archived_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    application: Mapped[list["Application"]] = relationship("Application", back_populates="opportunity")
    interview: Mapped[list["Interview"]] = relationship("Interview", back_populates="opportunity")
    offer: Mapped[list["Offer"]] = relationship("Offer", back_populates="opportunity")
    referral: Mapped[list["Referral"]] = relationship("Referral", back_populates="opportunity")
    feedback: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="opportunity")


class Posting(Base):
    __tablename__ = "posting"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="posting_pkey"),
        Index("idx_posting_created", "created_at"),
        Index("idx_posting_department", "categories_department"),
        Index("idx_posting_state", "state"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    text_: Mapped[str] = mapped_column("text", String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    state: Mapped[str | None] = mapped_column(String(50))
    distribution_channels: Mapped[list[str] | None] = mapped_column(ARRAY(Text()))
    location: Mapped[str | None] = mapped_column(String(255))
    categories_commitment: Mapped[str | None] = mapped_column(String(100))
    categories_department: Mapped[str | None] = mapped_column(String(100))
    categories_level: Mapped[str | None] = mapped_column(String(100))
    categories_team: Mapped[str | None] = mapped_column(String(100))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    application: Mapped[list["Application"]] = relationship("Application", back_populates="posting")
    interview: Mapped[list["Interview"]] = relationship("Interview", back_populates="posting")
    offer: Mapped[list["Offer"]] = relationship("Offer", back_populates="posting")


class Stage(Base):
    __tablename__ = "stage"
    __table_args__ = (PrimaryKeyConstraint("id", name="stage_pkey"), {"schema": "lever_data"})

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    text_: Mapped[str] = mapped_column("text", String(255), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    interview: Mapped[list["Interview"]] = relationship("Interview", back_populates="stage")


class User(Base):
    __tablename__ = "user"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_pkey"),
        Index("idx_user_deactivated", "deactivated_at"),
        Index("idx_user_email", "email"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    deactivated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    referral: Mapped[list["Referral"]] = relationship("Referral", back_populates="referrer_user")
    feedback: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="author")


class Application(Base):
    __tablename__ = "application"
    __table_args__ = (
        ForeignKeyConstraint(["opportunity_id"], ["lever_data.opportunity.id"], name="application_opportunity_id_fkey"),
        ForeignKeyConstraint(["posting_id"], ["lever_data.posting.id"], name="application_posting_id_fkey"),
        PrimaryKeyConstraint("id", name="application_pkey"),
        Index("idx_application_created", "created_at"),
        Index("idx_application_opportunity", "opportunity_id"),
        Index("idx_application_posting", "posting_id"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    posting_id: Mapped[str | None] = mapped_column(String(50))
    type: Mapped[str | None] = mapped_column(String(50))
    archived_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="application")
    posting: Mapped[Optional["Posting"]] = relationship("Posting", back_populates="application")


class Interview(Base):
    __tablename__ = "interview"
    __table_args__ = (
        ForeignKeyConstraint(["opportunity_id"], ["lever_data.opportunity.id"], name="interview_opportunity_id_fkey"),
        ForeignKeyConstraint(["posting_id"], ["lever_data.posting.id"], name="interview_posting_id_fkey"),
        ForeignKeyConstraint(["stage_id"], ["lever_data.stage.id"], name="interview_stage_id_fkey"),
        PrimaryKeyConstraint("id", name="interview_pkey"),
        Index("idx_interview_canceled", "canceled_at"),
        Index("idx_interview_date", "date"),
        Index("idx_interview_opportunity", "opportunity_id"),
        Index("idx_interview_posting", "posting_id"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    posting_id: Mapped[str | None] = mapped_column(String(50))
    stage_id: Mapped[str | None] = mapped_column(String(50))
    subject: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str | None] = mapped_column(String(50))
    duration: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String(255))
    canceled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="interview")
    posting: Mapped[Optional["Posting"]] = relationship("Posting", back_populates="interview")
    stage: Mapped[Optional["Stage"]] = relationship("Stage", back_populates="interview")
    feedback: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="interview")


class Offer(Base):
    __tablename__ = "offer"
    __table_args__ = (
        ForeignKeyConstraint(["opportunity_id"], ["lever_data.opportunity.id"], name="offer_opportunity_id_fkey"),
        ForeignKeyConstraint(["posting_id"], ["lever_data.posting.id"], name="offer_posting_id_fkey"),
        PrimaryKeyConstraint("id", name="offer_pkey"),
        Index("idx_offer_opportunity", "opportunity_id"),
        Index("idx_offer_posting", "posting_id"),
        Index("idx_offer_signed", "signed_at"),
        Index("idx_offer_status", "status"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    posting_id: Mapped[str | None] = mapped_column(String(50))
    creator_id: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    sent_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    approved_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    signed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="offer")
    posting: Mapped[Optional["Posting"]] = relationship("Posting", back_populates="offer")


class Referral(Base):
    __tablename__ = "referral"
    __table_args__ = (
        ForeignKeyConstraint(["opportunity_id"], ["lever_data.opportunity.id"], name="referral_opportunity_id_fkey"),
        ForeignKeyConstraint(["referrer_user_id"], ["lever_data.user.id"], name="referral_referrer_user_id_fkey"),
        PrimaryKeyConstraint("id", name="referral_pkey"),
        Index("idx_referral_opportunity", "opportunity_id"),
        Index("idx_referral_user", "referrer_user_id"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    referrer_user_id: Mapped[str | None] = mapped_column(String(50))
    type: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="referral")
    referrer_user: Mapped[Optional["User"]] = relationship("User", back_populates="referral")


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (
        ForeignKeyConstraint(["author_id"], ["lever_data.user.id"], name="feedback_author_id_fkey"),
        ForeignKeyConstraint(["interview_id"], ["lever_data.interview.id"], name="feedback_interview_id_fkey"),
        ForeignKeyConstraint(["opportunity_id"], ["lever_data.opportunity.id"], name="feedback_opportunity_id_fkey"),
        PrimaryKeyConstraint("id", name="feedback_pkey"),
        Index("idx_feedback_author", "author_id"),
        Index("idx_feedback_completed", "completed_at"),
        Index("idx_feedback_interview", "interview_id"),
        Index("idx_feedback_opportunity", "opportunity_id"),
        {"schema": "lever_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    interview_id: Mapped[str | None] = mapped_column(String(50))
    author_id: Mapped[str | None] = mapped_column(String(50))
    text_: Mapped[str | None] = mapped_column("text", Text)
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    author: Mapped[Optional["User"]] = relationship("User", back_populates="feedback")
    interview: Mapped[Optional["Interview"]] = relationship("Interview", back_populates="feedback")
    opportunity: Mapped["Opportunity"] = relationship("Opportunity", back_populates="feedback")
