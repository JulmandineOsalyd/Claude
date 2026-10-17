# Claude : mods Claude Code

Marketplace de mods Claude Code (`julie-mods`), en français. Chaque mod a son dossier à la racine.

| Mod | Dossier | Rôle |
| --- | --- | --- |
| [prompt-enhancer](#prompt-enhancer) | `prompt-enhancer/` | Améliore ton prompt avec Haiku 5.5, en s'appuyant sur l'historique de la conversation. |
| [assistant-dev](#assistant-dev) | `assistant-dev/` | Garde le fil d'une session : résumé des tâches, panneau Tâches, respiration, compactage au bon moment, amélioration du prompt. |

Les deux mods s'installent depuis le même marketplace, `JulmandineOsalyd/Claude`, et peuvent être utilisés ensemble : chacun affiche alors un bouton **✨ Améliorer le prompt**.

## Installation

Dans l'app de bureau (où `/plugin` ne s'exécute pas) : clique sur + à côté de la zone de saisie, puis Plugins, Add marketplace avec `JulmandineOsalyd/Claude`, puis Add plugin.

Pour chaque mod, dans un terminal Claude Code, ou depuis un shell avec `claude plugin install` à la place de `/plugin install` : voir la section du mod.

---

## prompt-enhancer

Mod Claude Code qui améliore ton prompt avec Haiku 5.5, en s'appuyant sur les derniers messages de la conversation.

### Installation

Dans un terminal Claude Code :

```
/plugin install prompt-enhancer --marketplace JulmandineOsalyd/Claude
```

Depuis un shell :

```
claude plugin install prompt-enhancer --marketplace JulmandineOsalyd/Claude
```

### Utilisation

- Bouton **✨ Améliorer le prompt** dans la bande au-dessus de la barre de saisie (terminal et app de bureau), avec **↩ Annuler**.
- Partout : `/ameliorer ton prompt ici` remplace la barre de saisie par la version améliorée, `/annuler-prompt` restaure l'original.

### Dossier

Tout le code du mod est dans `prompt-enhancer/` : le manifeste (`.claude-plugin/plugin.json`), les hooks (`hooks/`), les types (`types/`) et la configuration TypeScript (`tsconfig.json`). Le marketplace de la racine (`.claude-plugin/marketplace.json`) pointe vers ce dossier.

### Réglages

`prompt-enhancer/hooks/build.ts` : nombre de messages d'historique (`MAX_MESSAGES`) et troncature (`MAX_CHARS`). `prompt-enhancer/hooks/system.ts` : system prompt envoyé à Haiku.

---

## assistant-dev

Mod Claude Code qui garde le fil d'une session. Il fait :

- un résumé des tâches réalisées à la fin de chaque réponse ;
- un panneau Tâches (**Lancer** / **Garder** / **Écarter**), où Lancer ajoute la tâche au prompt sans rien écraser ;
- une respiration 4-4-4-4 dans la bande au-dessus du prompt, affichée seulement pendant que Claude travaille ;
- des propositions de compactage aux bons moments (fin de tâche majeure, changement de sujet, contexte chargé), avec la raison ;
- un bouton **✨ Améliorer le prompt**.

### Installation

Dans un terminal Claude Code :

```
/plugin install assistant-dev --marketplace JulmandineOsalyd/Claude
```

Depuis un shell :

```
claude plugin install assistant-dev --marketplace JulmandineOsalyd/Claude
```

### Dossier

Tout le code du mod est dans `assistant-dev/` : le manifeste (`.claude-plugin/plugin.json`), les hooks (`hooks/`, avec `logic.ts` pour la logique et ses tests), les types (`types/`) et la configuration TypeScript (`tsconfig.json`).
