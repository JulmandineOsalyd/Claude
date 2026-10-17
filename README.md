# prompt-enhancer

Mod Claude Code qui améliore ton prompt avec Haiku 5.5, en s'appuyant sur les derniers messages de la conversation.

## Installation

Dans un terminal Claude Code :

```
/plugin install prompt-enhancer --marketplace JulmandineOsalyd/Claude
```

Depuis un shell :

```
claude plugin install prompt-enhancer --marketplace JulmandineOsalyd/Claude
```

Dans l'app de bureau (où `/plugin` ne s'exécute pas) : clique sur + à côté de la zone de saisie, puis Plugins, Add marketplace avec `JulmandineOsalyd/Claude`, puis Add plugin.

## Utilisation

- Bouton **✨ Améliorer le prompt** dans la bande au-dessus de la barre de saisie (terminal et app de bureau), avec **↩ Annuler**.
- Partout : `/ameliorer ton prompt ici` remplace la barre de saisie par la version améliorée, `/annuler-prompt` restaure l'original.

## Dossier

Tout le code du mod est dans `prompt-enhancer/` : le manifeste (`.claude-plugin/plugin.json`), les hooks (`hooks/`), les types (`types/`) et la configuration TypeScript (`tsconfig.json`). Le marketplace de la racine (`.claude-plugin/marketplace.json`) pointe vers ce dossier.

## Réglages

`prompt-enhancer/hooks/build.ts` : nombre de messages d'historique (`MAX_MESSAGES`) et troncature (`MAX_CHARS`). `prompt-enhancer/hooks/system.ts` : system prompt envoyé à Haiku.

---

# assistant-dev

Mod Claude Code (en français) qui garde le fil d'une session : résumé des tâches réalisées, panneau Tâches (Lancer / Garder / Écarter, sans rien écraser dans le prompt), respiration 4-4-4-4 pendant que Claude travaille, propositions de compactage aux bons moments avec la raison, et bouton **✨ Améliorer le prompt**.

```
/plugin install assistant-dev --marketplace JulmandineOsalyd/Claude
```

Si `prompt-enhancer` est aussi installé, les deux mods affichent un bouton d'amélioration du prompt.
