import datetime
import decimal

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="account_pkey"),
        Index("idx_account_name", "name"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    currency_code: Mapped[str | None] = mapped_column(String(3))
    time_zone: Mapped[str | None] = mapped_column(String(100))
    auto_tagging_enabled: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped[list["Campaign"]] = relationship("Campaign", back_populates="account")


class Budget(Base):
    __tablename__ = "budget"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="budget_pkey"),
        Index("idx_budget_name", "name"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    amount_micros: Mapped[int | None] = mapped_column(BigInteger)
    delivery_method: Mapped[str | None] = mapped_column(String(50))
    period: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Campaign(Base):
    __tablename__ = "campaign"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["google_adwords_data.account.id"], name="campaign_account_id_fkey"),
        PrimaryKeyConstraint("id", name="campaign_pkey"),
        Index("idx_campaign_account", "account_id"),
        Index("idx_campaign_start_date", "start_date"),
        Index("idx_campaign_status", "status"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    serving_status: Mapped[str | None] = mapped_column(String(50))
    start_date: Mapped[datetime.date | None] = mapped_column(Date)
    end_date: Mapped[datetime.date | None] = mapped_column(Date)
    advertising_channel_type: Mapped[str | None] = mapped_column(String(50))
    budget_id: Mapped[int | None] = mapped_column(BigInteger)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped["Account"] = relationship("Account", back_populates="campaign")
    ad_group: Mapped[list["AdGroup"]] = relationship("AdGroup", back_populates="campaign")
    campaign_stats: Mapped[list["CampaignStats"]] = relationship("CampaignStats", back_populates="campaign")
    geographic_stats: Mapped[list["GeographicStats"]] = relationship("GeographicStats", back_populates="campaign")


class AdGroup(Base):
    __tablename__ = "ad_group"
    __table_args__ = (
        ForeignKeyConstraint(["campaign_id"], ["google_adwords_data.campaign.id"], name="ad_group_campaign_id_fkey"),
        PrimaryKeyConstraint("id", name="ad_group_pkey"),
        Index("idx_ad_group_campaign", "campaign_id"),
        Index("idx_ad_group_status", "status"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    type: Mapped[str | None] = mapped_column(String(50))
    cpc_bid_micros: Mapped[int | None] = mapped_column(BigInteger)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="ad_group")
    ad: Mapped[list["Ad"]] = relationship("Ad", back_populates="ad_group")
    ad_group_stats: Mapped[list["AdGroupStats"]] = relationship("AdGroupStats", back_populates="ad_group")
    keyword: Mapped[list["Keyword"]] = relationship("Keyword", back_populates="ad_group")


class CampaignStats(Base):
    __tablename__ = "campaign_stats"
    __table_args__ = (
        ForeignKeyConstraint(
            ["campaign_id"], ["google_adwords_data.campaign.id"], name="campaign_stats_campaign_id_fkey"
        ),
        PrimaryKeyConstraint("campaign_id", "date", name="campaign_stats_pkey"),
        Index("idx_campaign_stats_date", "date"),
        {"schema": "google_adwords_data"},
    )

    campaign_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_micros: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    conversions: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    conversions_value: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    views: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    interactions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="campaign_stats")


class GeographicStats(Base):
    __tablename__ = "geographic_stats"
    __table_args__ = (
        ForeignKeyConstraint(
            ["campaign_id"], ["google_adwords_data.campaign.id"], name="geographic_stats_campaign_id_fkey"
        ),
        PrimaryKeyConstraint("campaign_id", "date", "country_code", "region_name", name="geographic_stats_pkey"),
        Index("idx_geographic_stats_country", "country_code"),
        Index("idx_geographic_stats_date", "date"),
        {"schema": "google_adwords_data"},
    )

    campaign_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    region_name: Mapped[str] = mapped_column(String(255), primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_micros: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    conversions: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="geographic_stats")


class Ad(Base):
    __tablename__ = "ad"
    __table_args__ = (
        ForeignKeyConstraint(["ad_group_id"], ["google_adwords_data.ad_group.id"], name="ad_ad_group_id_fkey"),
        PrimaryKeyConstraint("id", name="ad_pkey"),
        Index("idx_ad_ad_group", "ad_group_id"),
        Index("idx_ad_status", "status"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ad_group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    final_urls: Mapped[list[str] | None] = mapped_column(ARRAY(Text()))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    ad_group: Mapped["AdGroup"] = relationship("AdGroup", back_populates="ad")


class AdGroupStats(Base):
    __tablename__ = "ad_group_stats"
    __table_args__ = (
        ForeignKeyConstraint(
            ["ad_group_id"], ["google_adwords_data.ad_group.id"], name="ad_group_stats_ad_group_id_fkey"
        ),
        PrimaryKeyConstraint("ad_group_id", "date", name="ad_group_stats_pkey"),
        Index("idx_ad_group_stats_date", "date"),
        {"schema": "google_adwords_data"},
    )

    ad_group_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_micros: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    conversions: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    conversions_value: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    ad_group: Mapped["AdGroup"] = relationship("AdGroup", back_populates="ad_group_stats")


class Keyword(Base):
    __tablename__ = "keyword"
    __table_args__ = (
        ForeignKeyConstraint(["ad_group_id"], ["google_adwords_data.ad_group.id"], name="keyword_ad_group_id_fkey"),
        PrimaryKeyConstraint("id", name="keyword_pkey"),
        Index("idx_keyword_ad_group", "ad_group_id"),
        Index("idx_keyword_status", "status"),
        {"schema": "google_adwords_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ad_group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    text_: Mapped[str | None] = mapped_column("text", String(255))
    match_type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    cpc_bid_micros: Mapped[int | None] = mapped_column(BigInteger)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    ad_group: Mapped["AdGroup"] = relationship("AdGroup", back_populates="keyword")
    keyword_stats: Mapped[list["KeywordStats"]] = relationship("KeywordStats", back_populates="keyword")


class KeywordStats(Base):
    __tablename__ = "keyword_stats"
    __table_args__ = (
        ForeignKeyConstraint(["keyword_id"], ["google_adwords_data.keyword.id"], name="keyword_stats_keyword_id_fkey"),
        PrimaryKeyConstraint("keyword_id", "date", name="keyword_stats_pkey"),
        Index("idx_keyword_stats_date", "date"),
        {"schema": "google_adwords_data"},
    )

    keyword_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    impressions: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    clicks: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    cost_micros: Mapped[int | None] = mapped_column(BigInteger, server_default=text("0"))
    conversions: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    keyword: Mapped["Keyword"] = relationship("Keyword", back_populates="keyword_stats")
