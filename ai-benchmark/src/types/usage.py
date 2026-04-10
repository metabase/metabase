"""Token usage types for LLM calls."""

from pydantic import BaseModel, Field, RootModel

from src.llm.models import AvailableModels


class TokenUsage(BaseModel):
    model: AvailableModels = Field(description="ID of the model used to generate the response.")
    prompt: int = Field(description="Number of tokens used in the prompt.", default=0)
    completion: int = Field(description="Number of tokens used in the completion.", default=0)
    costs: float = Field(default=0, description="Costs in USD for the token usage.")

    @property
    def total(self) -> int:
        return self.prompt + self.completion

    def add(self, usage: "TokenUsage") -> None:
        assert self.model == usage.model, "Trying to add usage with different models"
        self.prompt += usage.prompt
        self.completion += usage.completion
        self.costs += usage.costs


class UsageDict(RootModel):
    """Aggregates token usage across multiple models."""

    root: dict[AvailableModels, TokenUsage] = Field(default={})

    def add(self, usage: TokenUsage) -> None:
        self.root.setdefault(usage.model, TokenUsage(model=usage.model)).add(usage)

    @property
    def prompt(self) -> int:
        return sum(u.prompt for u in self.root.values())

    @property
    def completion(self) -> int:
        return sum(u.completion for u in self.root.values())

    @property
    def total(self) -> int:
        return sum(u.total for u in self.root.values())

    @property
    def estimated_costs(self) -> float:
        return sum(u.costs for u in self.root.values())

    def model_dump(self, *args, **kwargs):
        res = {k: v.model_dump(exclude=["model"]) for k, v in self.root.items()}
        res.update({"promptTokens": self.prompt, "completionTokens": self.completion})
        return res
