
from datasets import load_dataset
from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                          TrainingArguments, Trainer, DataCollatorWithPadding)
import torch

dataset = load_dataset("go_emotions", "simplified")  
dataset = dataset.rename_column("labels", "label")   

def label_map(ex):
    frustration_labels = [2, 3, 9]  # anger, annoyance, disappointment
    ex["label"] = int(any(label in frustration_labels for label in ex["label"]))
    return ex
dataset = dataset.map(label_map)

model_name = "j-hartmann/emotion-english-distilroberta-base"
tok = AutoTokenizer.from_pretrained(model_name)
def tok_fn(ex): return tok(ex["text"], truncation=True, padding="max_length", max_length=128)
dataset = dataset.map(tok_fn, batched=True)

model = AutoModelForSequenceClassification.from_pretrained(
    model_name, 
    num_labels=2, 
    ignore_mismatched_sizes=True
)

training_args = TrainingArguments(
    "frustration-detector",
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    num_train_epochs=3,
    eval_strategy="epoch",
    dataloader_pin_memory=False  
)

data_collator = DataCollatorWithPadding(tokenizer=tok)

trainer = Trainer(
    model=model, 
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    data_collator=data_collator
)
trainer.train()
