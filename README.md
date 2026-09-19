# IMPOSTOR — versão 2

Projeto multiplayer online para GitHub Pages usando somente:

- HTML
- CSS
- JavaScript puro
- Firebase Authentication (Anônimo)
- Firebase Realtime Database

Sem Node.js, sem backend próprio e sem banco pago obrigatório.

## O que já está configurado

O arquivo `firebase-config.js` já está preenchido para o projeto Firebase:

`impostor-cc29c`

Você **não precisa instalar SDK com npm**. O projeto importa o Firebase Web SDK 12.19.0 diretamente do CDN oficial.

## Recursos

- Criação de sala com código aleatório de 5 caracteres
- Entrada por código
- Link de convite `?room=CODIGO`
- 3 a 12 jogadores
- 1 ou 2 impostores
- Modo "palavra diferente"
- Modo "impostor sem palavra"
- 6 categorias + modo misturado
- Mais de 100 pares de palavras
- Palavra e função privadas por jogador
- Jogador inicial sorteado
- Status online/offline
- Reconexão/retorno à sala após atualizar a página
- Transferência manual de host ao sair
- Recuperação de host se ele ficar offline
- Remoção de jogadores pelo host no lobby
- Votação privada
- Resultado da rodada
- Placar acumulado
- Jogar novamente
- Layout responsivo para PC e celular

## PASSO OBRIGATÓRIO — regras do Realtime Database

No Firebase Console:

1. Abra **Realtime Database**.
2. Entre em **Regras / Rules**.
3. Apague as regras atuais.
4. Copie **todo** o conteúdo de `firebase.rules.json`.
5. Cole no Firebase.
6. Clique em **Publicar**.

Se não fizer isso, criar/entrar em sala pode retornar `PERMISSION_DENIED`.

## Authentication

Em:

**Authentication > Sign-in method**

o provedor **Anônimo / Anonymous** deve estar ATIVADO.

## Testar localmente

No VS Code, dentro da pasta:

```bash
py -m http.server 5500
```

Abra:

```text
http://localhost:5500
```

Teste com:
- janela normal + janela anônima; ou
- PC + celular na mesma rede usando o endereço do computador.

Não abra o HTML com `file://`.

## GitHub Pages

Repositório desejado:

`https://github.com/Kallebjose/impostorjogo`

Suba estes arquivos na **raiz** do repositório:

```text
index.html
styles.css
app.js
words.js
firebase-config.js
firebase.rules.json
README.md
.nojekyll
```

Depois:

1. GitHub > repositório `impostorjogo`
2. **Settings**
3. **Pages**
4. **Build and deployment**
5. Source: **Deploy from a branch**
6. Branch: `main`
7. Folder: `/ (root)`
8. Save

URL esperada:

`https://kallebjose.github.io/impostorjogo/`

## Se aparecer `auth/unauthorized-domain`

No Firebase Console:

**Authentication > Settings > Authorized domains**

adicione:

`kallebjose.github.io`

Para login anônimo geralmente isso não é necessário, mas o passo resolve caso a configuração da conta exija o domínio.

## Segurança

A palavra de cada jogador fica em:

`rooms/{codigo}/private/{uid}`

As regras permitem que:
- o jogador leia somente a própria palavra/função;
- o host leia as informações privadas necessárias para calcular o resultado;
- outros jogadores não leiam essas informações.

Os votos ficam em:

`rooms/{codigo}/votes/{uid}`

Cada jogador lê o próprio voto; o host lê os votos para fechar a rodada.

O `firebase-config.js` contém apenas a configuração pública de um app web Firebase. Nunca coloque Service Account, chave privada ou credenciais administrativas no GitHub.

## Pontuação

- Civis vencem: +2 para cada civil.
- Impostores vencem: +2 para cada impostor.
- Civil que votar em um impostor: +1 adicional.
- Empate no topo da votação: ninguém é eliminado e os impostores vencem a rodada.
