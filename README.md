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

## Réglages

`hooks/build.ts` : nombre de messages d'historique (`MAX_MESSAGES`) et troncature (`MAX_CHARS`). `hooks/system.ts` : system prompt envoyé à Haiku.
