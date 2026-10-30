CREATE TABLE IF NOT EXISTS utenti (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  stato TEXT,
  prima_richiesta TEXT,
  ultima_richiesta TEXT,
  invito_da TEXT,
  approvato_da TEXT,
  motivo TEXT,
  storico TEXT,
  updated_at TEXT
);
